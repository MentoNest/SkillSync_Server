import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { User } from '../../user/entities/user.entity';
import { RedisService } from './redis.service';
import { NotificationService } from './notification.service';
import * as geoip from 'geoip-lite';

export interface SuspiciousCheckResult {
  isSuspicious: boolean;
  reasons: string[];
  lockAccount: boolean;
  geoInfo?: {
    country: string | null;
    city: string | null;
    lat: number | null;
    lon: number | null;
  };
}

@Injectable()
export class SuspiciousDetectionService {
  private readonly logger = new Logger(SuspiciousDetectionService.name);

  // Configurable thresholds via environment variables
  private readonly MAX_FAILED_ATTEMPTS = parseInt(
    process.env.MAX_FAILED_ATTEMPTS || '5',
    10,
  );
  private readonly TIME_WINDOW_MINUTES = parseInt(
    process.env.TIME_WINDOW_MINUTES || '15',
    10,
  );
  private readonly LOCKOUT_MINUTES = parseInt(
    process.env.LOCKOUT_MINUTES || '30',
    10,
  );
  private readonly SUSPICIOUS_DISTANCE_KM = parseInt(
    process.env.SUSPICIOUS_DISTANCE_KM || '500',
    10,
  );

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Geolocation lookup with fallback for local/private IPs
   */
  getGeoLocation(ipAddress?: string): {
    country: string | null;
    city: string | null;
    lat: number | null;
    lon: number | null;
  } {
    if (!ipAddress || ipAddress === '127.0.0.1' || ipAddress === '::1') {
      return { country: 'LOCAL', city: 'Localhost', lat: 0, lon: 0 };
    }

    try {
      const geo = geoip.lookup(ipAddress);
      if (geo) {
        return {
          country: geo.country || null,
          city: geo.city || null,
          lat: geo.ll ? geo.ll[0] : null,
          lon: geo.ll ? geo.ll[1] : null,
        };
      }
    } catch (err: any) {
      this.logger.warn(`GeoIP lookup error for ${ipAddress}: ${err.message}`);
    }

    return { country: null, city: null, lat: null, lon: null };
  }

  /**
   * Calculate distance between two coordinate pairs (Haversine formula in KM)
   */
  private calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Track failed login attempt and check if threshold is exceeded
   */
  async recordFailedLogin(params: {
    walletAddress?: string;
    email?: string;
    ipAddress?: string;
    userAgent?: string;
    reason?: string;
  }): Promise<SuspiciousCheckResult> {
    const { walletAddress, email, ipAddress, userAgent, reason } = params;
    const identifier = walletAddress || email || ipAddress || 'unknown';
    const reasons: string[] = [reason || 'INVALID_CREDENTIALS'];

    const windowSeconds = this.TIME_WINDOW_MINUTES * 60;
    const ipKey = `failed_login:ip:${ipAddress}`;
    const userKey = `failed_login:user:${identifier.toLowerCase()}`;

    const [ipFailures, userFailures] = await Promise.all([
      this.redisService.incr(ipKey),
      this.redisService.incr(userKey),
    ]);

    if (ipFailures === 1) await this.redisService.expire(ipKey, windowSeconds);
    if (userFailures === 1) await this.redisService.expire(userKey, windowSeconds);

    let isSuspicious = false;
    let shouldLock = false;

    if (ipFailures >= this.MAX_FAILED_ATTEMPTS || userFailures >= this.MAX_FAILED_ATTEMPTS) {
      isSuspicious = true;
      shouldLock = true;
      reasons.push(
        `EXCEEDED_MAX_FAILED_ATTEMPTS (${Math.max(ipFailures, userFailures)}/${this.MAX_FAILED_ATTEMPTS} in ${this.TIME_WINDOW_MINUTES}m)`,
      );
    }

    const geo = this.getGeoLocation(ipAddress);

    // If user exists, lock account temporarily if threshold exceeded
    let user: User | null = null;
    if (walletAddress) {
      user = await this.userRepository.findOne({ where: { walletAddress: walletAddress.toLowerCase() } });
    } else if (email) {
      user = await this.userRepository.findOne({ where: { email: email.toLowerCase() } });
    }

    if (user && shouldLock) {
      user.isLocked = true;
      user.lockoutUntil = new Date(Date.now() + this.LOCKOUT_MINUTES * 60 * 1000);
      await this.userRepository.save(user);
    }

    // Save audit log
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: user ? user.id : null,
        walletAddress: walletAddress?.toLowerCase() || null,
        ipAddress: ipAddress || null,
        eventType: 'login_failed',
        isSuspicious,
        suspiciousReason: isSuspicious ? reasons.join('; ') : null,
        geoCountry: geo.country,
        geoCity: geo.city,
        geoLat: geo.lat,
        geoLon: geo.lon,
        userAgent: userAgent || null,
        metadata: {
          ipFailures,
          userFailures,
          lockoutUntil: user?.lockoutUntil || null,
        },
      }),
    );

    if (isSuspicious) {
      await this.notificationService.sendAdminAlert({
        eventType: 'SUSPICIOUS_FAILED_LOGINS',
        reason: reasons.join('; '),
        userId: user?.id,
        walletAddress,
        ipAddress,
        metadata: { ipFailures, userFailures },
      });
    }

    return {
      isSuspicious,
      reasons,
      lockAccount: shouldLock,
      geoInfo: geo,
    };
  }

  /**
   * Evaluate suspicious login patterns on successful authentication
   */
  async evaluateLogin(params: {
    user: User;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<SuspiciousCheckResult> {
    const { user, ipAddress, userAgent } = params;
    const reasons: string[] = [];
    let isSuspicious = false;
    const geo = this.getGeoLocation(ipAddress);

    // 1. Abnormal IP check (IP not seen in last 30 days)
    if (ipAddress && ipAddress !== '127.0.0.1' && ipAddress !== '::1') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const previousLogWithIp = await this.auditLogRepository.findOne({
        where: {
          userId: user.id,
          ipAddress,
          createdAt: MoreThan(thirtyDaysAgo),
        },
      });

      if (!previousLogWithIp && user.lastLoginIp && user.lastLoginIp !== ipAddress) {
        isSuspicious = true;
        reasons.push(`NEW_IP_NOT_SEEN_IN_30_DAYS (IP: ${ipAddress})`);
      }
    }

    // 2. Rapid geographic distance changes (requires IP geolocation)
    if (geo.lat !== null && geo.lon !== null && user.id) {
      const lastAuditLog = await this.auditLogRepository.findOne({
        where: { userId: user.id, eventType: 'login_success' },
        order: { createdAt: 'DESC' },
      });

      if (
        lastAuditLog &&
        lastAuditLog.geoLat !== null &&
        lastAuditLog.geoLon !== null &&
        lastAuditLog.ipAddress !== ipAddress
      ) {
        const distanceKm = this.calculateDistanceKm(
          lastAuditLog.geoLat,
          lastAuditLog.geoLon,
          geo.lat,
          geo.lon,
        );

        const timeDiffMinutes =
          (Date.now() - new Date(lastAuditLog.createdAt).getTime()) / (1000 * 60);

        // If distance is significant and speed > 800 km/h (impossible travel) or > threshold in short window
        const impliedSpeedKmH =
          timeDiffMinutes > 0 ? (distanceKm / timeDiffMinutes) * 60 : 99999;

        if (distanceKm > this.SUSPICIOUS_DISTANCE_KM && impliedSpeedKmH > 800) {
          isSuspicious = true;
          reasons.push(
            `RAPID_GEOGRAPHIC_CHANGE (${Math.round(distanceKm)}km in ${Math.round(timeDiffMinutes)}m, speed ${Math.round(impliedSpeedKmH)}km/h)`,
          );
        }
      }
    }

    // 3. Abnormal login times check (e.g. between 2 AM and 5 AM UTC / off-peak)
    const currentHourUtc = new Date().getUTCHours();
    const abnormalStart = parseInt(process.env.ABNORMAL_HOURS_START || '2', 10);
    const abnormalEnd = parseInt(process.env.ABNORMAL_HOURS_END || '5', 10);

    if (currentHourUtc >= abnormalStart && currentHourUtc <= abnormalEnd) {
      // Check if user regularly logs in at this hour or if it's unusual
      const pastLoginsAtSameHour = await this.auditLogRepository.count({
        where: {
          userId: user.id,
          eventType: 'login_success',
        },
      });

      if (pastLoginsAtSameHour === 0 && user.createdAt) {
        // Flag unusual off-hours login
        reasons.push(`ABNORMAL_LOGIN_TIME (${currentHourUtc}:00 UTC unusual access window)`);
      }
    }

    // Log the successful login in audit logs
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: user.id,
        walletAddress: user.walletAddress,
        ipAddress: ipAddress || null,
        eventType: 'login_success',
        isSuspicious,
        suspiciousReason: isSuspicious ? reasons.join('; ') : null,
        geoCountry: geo.country,
        geoCity: geo.city,
        geoLat: geo.lat,
        geoLon: geo.lon,
        userAgent: userAgent || null,
        metadata: {
          reasons,
        },
      }),
    );

    // Clear failed counters on success
    if (ipAddress) await this.redisService.del(`failed_login:ip:${ipAddress}`);
    if (user.walletAddress) {
      await this.redisService.del(`failed_login:user:${user.walletAddress.toLowerCase()}`);
    }
    if (user.email) {
      await this.redisService.del(`failed_login:user:${user.email.toLowerCase()}`);
    }

    // Trigger admin alert if suspicious
    if (isSuspicious) {
      await this.notificationService.sendAdminAlert({
        eventType: 'SUSPICIOUS_LOGIN_SUCCESS',
        reason: reasons.join('; '),
        userId: user.id,
        walletAddress: user.walletAddress,
        ipAddress,
        metadata: { reasons, geo },
      });
    }

    return {
      isSuspicious,
      reasons,
      lockAccount: false,
      geoInfo: geo,
    };
  }

  /**
   * Retrieve suspicious activity dashboard records for admin review
   */
  async getSuspiciousActivityDashboard(params: {
    page?: number;
    limit?: number;
    walletAddress?: string;
  }): Promise<{
    data: AuditLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('log')
      .where('log.isSuspicious = :isSuspicious', { isSuspicious: true })
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (params.walletAddress) {
      queryBuilder.andWhere('LOWER(log.walletAddress) = LOWER(:walletAddress)', {
        walletAddress: params.walletAddress,
      });
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
