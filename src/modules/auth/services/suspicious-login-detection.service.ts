import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { AuditLog, AuditEventType } from '../auth/entities/audit-log.entity';
import { User } from '../auth/entities/user.entity';
import {
  geolocateIP,
  isImpossibleTravel,
  GeoLocation,
  calculateGeographicDistance,
} from '../../common/utils/geolocation.utils';

/**
 * Detection result for a login attempt
 */
export interface SuspiciousLoginResult {
  isSuspicious: boolean;
  reasons: string[];
  riskScore: number; // 0-100
  shouldLockAccount: boolean;
  lockoutDurationMinutes: number;
}

/**
 * Login context for detection analysis
 */
export interface LoginContext {
  walletAddress: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

/**
 * IP login history for tracking
 */
interface IPLoginHistory {
  ipAddress: string;
  country: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  success: boolean;
}

/**
 * Suspicious Login Detection Service
 * Monitors authentication patterns and triggers security alerts
 */
@Injectable()
export class SuspiciousLoginDetectionService {
  private readonly logger = new Logger(SuspiciousLoginDetectionService.name);

  // Redis key prefixes
  private readonly FAILED_ATTEMPTS_KEY = 'auth:failed_attempts';
  private readonly IP_HISTORY_KEY = 'auth:ip_history';
  private readonly ACCOUNT_LOCKOUT_KEY = 'auth:account_lockout';
  private readonly LOGIN_HISTORY_KEY = 'auth:login_history';

  // Configuration defaults
  private readonly DEFAULT_MAX_FAILED_ATTEMPTS = 5;
  private readonly DEFAULT_TIME_WINDOW_MINUTES = 15;
  private readonly DEFAULT_LOCKOUT_DURATION_MINUTES = 30;
  private readonly DEFAULT_MAX_RISK_SCORE = 100;
  private readonly IMPOSSIBLE_TRAVEL_THRESHOLD_KM = 900; // km/h travel speed

  constructor(
    private redisService: RedisService,
    private configService: ConfigService,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Analyzes a login attempt for suspicious patterns
   * Returns detailed analysis and recommendations
   */
  async detectSuspiciousLogin(
    context: LoginContext,
  ): Promise<SuspiciousLoginResult> {
    const reasons: string[] = [];
    let riskScore = 0;

    // Check if account is locked
    const isLocked = await this.isAccountLocked(context.walletAddress);
    if (isLocked) {
      return {
        isSuspicious: true,
        reasons: ['Account is temporarily locked due to suspicious activity'],
        riskScore: 100,
        shouldLockAccount: true,
        lockoutDurationMinutes: this.DEFAULT_LOCKOUT_DURATION_MINUTES,
      };
    }

    // Detection 1: Consecutive failed attempts
    const failedAttemptsResult = await this.checkFailedAttempts(
      context.walletAddress,
      context.ipAddress,
    );
    if (failedAttemptsResult.isSuspicious) {
      reasons.push(...failedAttemptsResult.reasons);
      riskScore += failedAttemptsResult.riskScore;
    }

    // Detection 2: New IP address
    const newIPResult = await this.checkNewIPAddress(
      context.walletAddress,
      context.ipAddress,
    );
    if (newIPResult.isSuspicious) {
      reasons.push(...newIPResult.reasons);
      riskScore += newIPResult.riskScore;
    }

    // Detection 3: Impossible travel
    const impossibleTravelResult = await this.checkImpossibleTravel(
      context.walletAddress,
      context.ipAddress,
      context.timestamp,
    );
    if (impossibleTravelResult.isSuspicious) {
      reasons.push(...impossibleTravelResult.reasons);
      riskScore += impossibleTravelResult.riskScore;
    }

    // Detection 4: Abnormal login time
    const abnormalTimeResult = await this.checkAbnormalLoginTime(
      context.walletAddress,
      context.timestamp,
    );
    if (abnormalTimeResult.isSuspicious) {
      reasons.push(...abnormalTimeResult.reasons);
      riskScore += abnormalTimeResult.riskScore;
    }

    // Normalize risk score to 0-100
    const normalizedRiskScore = Math.min(riskScore, this.DEFAULT_MAX_RISK_SCORE);
    const isSuspicious = normalizedRiskScore > 30; // Threshold for suspicious activity

    return {
      isSuspicious,
      reasons,
      riskScore: normalizedRiskScore,
      shouldLockAccount: normalizedRiskScore > 70,
      lockoutDurationMinutes: this.DEFAULT_LOCKOUT_DURATION_MINUTES,
    };
  }

  /**
   * Records a login attempt in the audit log
   */
  async recordLoginAttempt(
    context: LoginContext,
    success: boolean,
    suspiciousResult: SuspiciousLoginResult,
    errorMessage?: string,
  ): Promise<AuditLog> {
    // Geolocate IP
    let geoLocation: GeoLocation;
    try {
      geoLocation = await geolocateIP(context.ipAddress);
    } catch (error) {
      this.logger.warn(`Failed to geolocate IP ${context.ipAddress}`, error);
      geoLocation = { country: 'Unknown', latitude: 0, longitude: 0 };
    }

    const auditLog = this.auditLogRepository.create({
      walletAddress: context.walletAddress,
      userId: context.userId,
      eventType: success
        ? AuditEventType.LOGIN_SUCCESS
        : AuditEventType.LOGIN_FAILED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      country: geoLocation.country,
      latitude: geoLocation.latitude,
      longitude: geoLocation.longitude,
      isSuspicious: suspiciousResult.isSuspicious,
      suspiciousReasons: suspiciousResult.reasons,
      errorMessage,
      metadata: {
        riskScore: suspiciousResult.riskScore,
        shouldLockAccount: suspiciousResult.shouldLockAccount,
      },
    });

    await this.auditLogRepository.save(auditLog);

    // Store IP history for future comparisons
    if (success) {
      await this.storeIPHistory(
        context.walletAddress,
        context.ipAddress,
        geoLocation,
        true,
      );
    }

    // Trigger alerts if suspicious
    if (suspiciousResult.isSuspicious) {
      await this.triggerSecurityAlerts(context, suspiciousResult);
    }

    // Lock account if necessary
    if (suspiciousResult.shouldLockAccount) {
      await this.lockAccount(
        context.walletAddress,
        suspiciousResult.lockoutDurationMinutes,
      );
    }

    return auditLog;
  }

  /**
   * Records a failed login attempt and increments counter
   */
  async recordFailedAttempt(
    context: LoginContext,
    errorMessage: string,
  ): Promise<void> {
    // Increment failed attempts counter
    const countKey = `${this.FAILED_ATTEMPTS_KEY}:${context.walletAddress}:${context.ipAddress}`;
    const timeWindowSeconds = this.getTimeWindowSeconds();

    const attempts = await this.redisService.incr(countKey);
    if (attempts === 1) {
      // Set expiration on first increment
      await this.redisService.expire(countKey, timeWindowSeconds);
    }

    // Record in audit log
    const suspiciousResult = await this.detectSuspiciousLogin(context);
    await this.recordLoginAttempt(context, false, suspiciousResult, errorMessage);
  }

  /**
   * Clears failed attempts counter for a wallet/IP combination
   */
  async clearFailedAttempts(
    walletAddress: string,
    ipAddress: string,
  ): Promise<void> {
    const countKey = `${this.FAILED_ATTEMPTS_KEY}:${walletAddress}:${ipAddress}`;
    await this.redisService.del(countKey);
  }

  /**
   * Checks if account is currently locked
   */
  async isAccountLocked(walletAddress: string): Promise<boolean> {
    return await this.redisService.exists(
      `${this.ACCOUNT_LOCKOUT_KEY}:${walletAddress}`,
    );
  }

  /**
   * Locks an account temporarily
   */
  async lockAccount(
    walletAddress: string,
    durationMinutes: number,
  ): Promise<void> {
    const lockoutDurationSeconds = durationMinutes * 60;
    await this.redisService.setJson(
      `${this.ACCOUNT_LOCKOUT_KEY}:${walletAddress}`,
      {
        lockedAt: new Date(),
        reason: 'Suspicious activity detected',
        durationMinutes,
      },
      lockoutDurationSeconds,
    );

    this.logger.warn(
      `Account locked for ${walletAddress} for ${durationMinutes} minutes`,
    );
  }

  /**
   * Unlocks an account
   */
  async unlockAccount(walletAddress: string): Promise<void> {
    await this.redisService.del(
      `${this.ACCOUNT_LOCKOUT_KEY}:${walletAddress}`,
    );
    this.logger.log(`Account unlocked for ${walletAddress}`);
  }

  /**
   * Gets suspicious activity report for admin dashboard
   */
  async getSuspiciousActivityReport(
    filters: {
      startDate?: Date;
      endDate?: Date;
      country?: string;
      onlyLocked?: boolean;
      limit?: number;
    } = {},
  ): Promise<{
    totalSuspiciousActivities: number;
    activities: AuditLog[];
    lockedAccounts: string[];
  }> {
    const {
      startDate,
      endDate,
      country,
      onlyLocked = false,
      limit = 100,
    } = filters;

    let query = this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.isSuspicious = :isSuspicious', { isSuspicious: true })
      .orderBy('audit.createdAt', 'DESC')
      .take(limit);

    if (startDate) {
      query = query.andWhere('audit.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      query = query.andWhere('audit.createdAt <= :endDate', { endDate });
    }

    if (country) {
      query = query.andWhere('audit.country = :country', { country });
    }

    const activities = await query.getMany();

    // Get locked accounts
    const lockedAccountsKeys = await this.redisService.keys(
      `${this.ACCOUNT_LOCKOUT_KEY}:*`,
    );
    const lockedAccounts = lockedAccountsKeys.map((key) =>
      key.replace(`${this.ACCOUNT_LOCKOUT_KEY}:`, ''),
    );

    return {
      totalSuspiciousActivities: activities.length,
      activities,
      lockedAccounts,
    };
  }

  /**
   * Gets login history for a specific wallet
   */
  async getLoginHistory(
    walletAddress: string,
    limit: number = 50,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.walletAddress = :walletAddress', { walletAddress })
      .orderBy('audit.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Gets IP history for a wallet
   */
  async getIPHistory(walletAddress: string): Promise<IPLoginHistory[]> {
    const history = await this.redisService.getJson<IPLoginHistory[]>(
      `${this.IP_HISTORY_KEY}:${walletAddress}`,
    );
    return history || [];
  }

  // ==================== Private Helper Methods ====================

  private async checkFailedAttempts(
    walletAddress: string,
    ipAddress: string,
  ): Promise<{ isSuspicious: boolean; reasons: string[]; riskScore: number }> {
    const maxAttempts = this.getMaxFailedAttempts();
    const countKey = `${this.FAILED_ATTEMPTS_KEY}:${walletAddress}:${ipAddress}`;
    const attemptsStr = await this.redisService.get(countKey);
    const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

    if (attempts >= maxAttempts) {
      const reasonsCount = attempts - maxAttempts + 1;
      return {
        isSuspicious: true,
        reasons: [
          `${attempts} failed login attempts in ${this.getTimeWindowMinutes()} minutes`,
        ],
        riskScore: Math.min(reasonsCount * 15, 40),
      };
    }

    return { isSuspicious: false, reasons: [], riskScore: 0 };
  }

  private async checkNewIPAddress(
    walletAddress: string,
    ipAddress: string,
  ): Promise<{ isSuspicious: boolean; reasons: string[]; riskScore: number }> {
    const history = await this.getIPHistory(walletAddress);

    // Check if this IP has been seen before in last 30 days
    const knownIP = history.some((entry) => entry.ipAddress === ipAddress);

    if (!knownIP && history.length > 0) {
      // New IP detected
      const latestIP = history[0];
      return {
        isSuspicious: true,
        reasons: [
          `New IP address detected (${ipAddress}) from previous location (${latestIP.country})`,
        ],
        riskScore: 25,
      };
    }

    return { isSuspicious: false, reasons: [], riskScore: 0 };
  }

  private async checkImpossibleTravel(
    walletAddress: string,
    ipAddress: string,
    currentTime: Date,
  ): Promise<{ isSuspicious: boolean; reasons: string[]; riskScore: number }> {
    const history = await this.getIPHistory(walletAddress);

    if (history.length === 0) {
      return { isSuspicious: false, reasons: [], riskScore: 0 };
    }

    const lastLogin = history[0];
    const timeDiffMinutes =
      (currentTime.getTime() - lastLogin.timestamp) / (1000 * 60);

    if (timeDiffMinutes < 1) {
      // Less than 1 minute between logins
      return { isSuspicious: false, reasons: [], riskScore: 0 };
    }

    try {
      const currentGeoLocation = await geolocateIP(ipAddress);

      const isImpossible = isImpossibleTravel(
        lastLogin.latitude,
        lastLogin.longitude,
        currentGeoLocation.latitude,
        currentGeoLocation.longitude,
        timeDiffMinutes,
        this.IMPOSSIBLE_TRAVEL_THRESHOLD_KM,
      );

      if (isImpossible) {
        const distance = calculateGeographicDistance(
          lastLogin.latitude,
          lastLogin.longitude,
          currentGeoLocation.latitude,
          currentGeoLocation.longitude,
        );

        return {
          isSuspicious: true,
          reasons: [
            `Impossible travel detected: ${distance.toFixed(0)} km in ${timeDiffMinutes.toFixed(0)} minutes`,
          ],
          riskScore: 50,
        };
      }
    } catch (error) {
      this.logger.warn('Failed to check impossible travel', error);
    }

    return { isSuspicious: false, reasons: [], riskScore: 0 };
  }

  private async checkAbnormalLoginTime(
    walletAddress: string,
    currentTime: Date,
  ): Promise<{ isSuspicious: boolean; reasons: string[]; riskScore: number }> {
    // Get login history for this user
    const recentLogins = await this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.walletAddress = :walletAddress', { walletAddress })
      .andWhere('audit.eventType = :eventType', {
        eventType: AuditEventType.LOGIN_SUCCESS,
      })
      .andWhere(
        'audit.createdAt >= :startDate',
        {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      )
      .orderBy('audit.createdAt', 'DESC')
      .take(10)
      .getMany();

    if (recentLogins.length === 0) {
      return { isSuspicious: false, reasons: [], riskScore: 0 };
    }

    // Calculate average login hour
    const hours = recentLogins.map((log) => log.createdAt.getHours());
    const avgHour =
      hours.reduce((a, b) => a + b, 0) / hours.length;

    // Check if current login is significantly different
    const currentHour = currentTime.getHours();
    const hourDiff = Math.abs(currentHour - avgHour);

    // Consider abnormal if more than 6 hours away from average
    if (hourDiff > 6 && hourDiff < 18) {
      return {
        isSuspicious: true,
        reasons: [
          `Abnormal login time: typical logins around ${Math.round(avgHour)}:00, current login at ${currentHour}:00`,
        ],
        riskScore: 10,
      };
    }

    return { isSuspicious: false, reasons: [], riskScore: 0 };
  }

  private async storeIPHistory(
    walletAddress: string,
    ipAddress: string,
    geoLocation: GeoLocation,
    success: boolean,
  ): Promise<void> {
    const historyKey = `${this.IP_HISTORY_KEY}:${walletAddress}`;
    const currentHistory = await this.getIPHistory(walletAddress);

    const newEntry: IPLoginHistory = {
      ipAddress,
      country: geoLocation.country,
      latitude: geoLocation.latitude,
      longitude: geoLocation.longitude,
      timestamp: Date.now(),
      success,
    };

    // Keep last 50 entries
    const updatedHistory = [newEntry, ...currentHistory].slice(0, 50);
    const ttlSeconds = 30 * 24 * 60 * 60; // 30 days

    await this.redisService.setJson(historyKey, updatedHistory, ttlSeconds);
  }

  private async triggerSecurityAlerts(
    context: LoginContext,
    result: SuspiciousLoginResult,
  ): Promise<void> {
    const alertMessage = `
    🔒 SUSPICIOUS LOGIN DETECTED
    
    Wallet: ${context.walletAddress}
    IP Address: ${context.ipAddress}
    Risk Score: ${result.riskScore}/100
    
    Reasons:
    ${result.reasons.map((r) => `- ${r}`).join('\n')}
    
    Time: ${context.timestamp.toISOString()}
    User Agent: ${context.userAgent}
    `;

    this.logger.warn(alertMessage);

    // TODO: Implement email alert to admin
    // TODO: Implement webhook alert
    // TODO: Implement SMS alert
  }

  private getMaxFailedAttempts(): number {
    return this.configService.get<number>(
      'SECURITY_MAX_FAILED_ATTEMPTS',
      this.DEFAULT_MAX_FAILED_ATTEMPTS,
    );
  }

  private getTimeWindowMinutes(): number {
    return this.configService.get<number>(
      'SECURITY_TIME_WINDOW_MINUTES',
      this.DEFAULT_TIME_WINDOW_MINUTES,
    );
  }

  private getTimeWindowSeconds(): number {
    return this.getTimeWindowMinutes() * 60;
  }
}
