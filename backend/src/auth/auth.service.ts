import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuditLog } from './entities/audit-log.entity';
import { UserService } from '../user/user.service';
import { User, ProfileType } from '../user/entities/user.entity';
import { RedisService } from './services/redis.service';
import { NotificationService } from './services/notification.service';
import { SuspiciousDetectionService } from './services/suspicious-detection.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { NonceResponseDto } from './dto/nonce-response.dto';
import { RevokeAllResponseDto } from './dto/revoke-all-response.dto';
import { UserResponseDto } from '../user/dto/user-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly redisService: RedisService,
    private readonly notificationService: NotificationService,
    private readonly suspiciousDetectionService: SuspiciousDetectionService,
  ) {}

  /**
   * Generate one-time cryptographic nonce challenge for wallet authentication
   */
  async generateNonce(walletAddress: string): Promise<NonceResponseDto> {
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      throw new BadRequestException('Valid 42-character Ethereum wallet address is required');
    }

    const normalizedAddress = walletAddress.toLowerCase();
    const nonce = `Sign this one-time challenge to authenticate with SkillSync: ${crypto.randomBytes(16).toString('hex')}`;
    const ttlSeconds = 300; // 5 minutes

    await this.redisService.set(`nonce:${normalizedAddress}`, nonce, ttlSeconds);

    return {
      walletAddress: normalizedAddress,
      nonce,
      issuedAt: new Date(),
      expiresInSeconds: ttlSeconds,
    };
  }

  /**
   * Login with wallet signature or email credentials
   */
  async login(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    let user: User | null = null;

    if (loginDto.walletAddress) {
      const normalizedWallet = loginDto.walletAddress.toLowerCase();
      const expectedNonce = await this.redisService.get(`nonce:${normalizedWallet}`);

      if (!loginDto.signature) {
        await this.suspiciousDetectionService.recordFailedLogin({
          walletAddress: normalizedWallet,
          ipAddress,
          userAgent,
          reason: 'MISSING_WALLET_SIGNATURE',
        });
        throw new BadRequestException('Cryptographic signature is required for wallet login');
      }

      // Check if user exists or auto-provision
      user = await this.userService.findByWalletAddress(normalizedWallet);
      if (!user) {
        // Auto create user on first wallet connect
        const created = await this.userService.create({
          walletAddress: normalizedWallet,
          profileType: ProfileType.MENTEE,
        });
        user = await this.userService.findById(created.id);
      }

      // Consume nonce
      await this.redisService.del(`nonce:${normalizedWallet}`);
    } else if (loginDto.email && loginDto.password) {
      user = await this.userService.findByEmail(loginDto.email);
      if (!user) {
        await this.suspiciousDetectionService.recordFailedLogin({
          email: loginDto.email,
          ipAddress,
          userAgent,
          reason: 'USER_NOT_FOUND',
        });
        throw new UnauthorizedException('Invalid email or password');
      }

      // Basic password validation
      if (user.passwordHash && user.passwordHash !== loginDto.password) {
        const check = await this.suspiciousDetectionService.recordFailedLogin({
          email: loginDto.email,
          ipAddress,
          userAgent,
          reason: 'INVALID_PASSWORD',
        });
        if (check.lockAccount) {
          throw new ForbiddenException(
            'Account locked due to consecutive failed login attempts. Please try again in 30 minutes.',
          );
        }
        throw new UnauthorizedException('Invalid email or password');
      }
    } else {
      throw new BadRequestException('Provide either walletAddress & signature or email & password');
    }

    if (!user) {
      throw new UnauthorizedException('Authentication failed');
    }

    // Check account lockout
    if (user.isLocked) {
      if (user.lockoutUntil && new Date() > new Date(user.lockoutUntil)) {
        await this.userService.unlockAccount(user.id);
        user.isLocked = false;
        user.lockoutUntil = null;
      } else {
        throw new ForbiddenException('Your account is temporarily locked due to suspicious activity. Please try again later.');
      }
    }

    // Evaluate suspicious login patterns (geo, new IP, abnormal times)
    await this.suspiciousDetectionService.evaluateLogin({
      user,
      ipAddress,
      userAgent,
    });

    // Record login IP and timestamp
    await this.userService.recordLogin(user.id, ipAddress);

    return this.generateTokens(user, ipAddress, userAgent);
  }

  /**
   * Issue new access token using a valid refresh token
   */
  async refresh(refreshTokenStr: string): Promise<{ accessToken: string; expiresIn: number }> {
    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { token: refreshTokenStr, isRevoked: false },
      relations: { user: true },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }

    if (new Date() > new Date(tokenRecord.expiresAt)) {
      await this.refreshTokenRepository.remove(tokenRecord);
      throw new UnauthorizedException('Refresh token has expired');
    }

    const user = await this.userService.findById(tokenRecord.userId);
    if (!user || user.isLocked) {
      throw new ForbiddenException('Account is inactive or locked');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      walletAddress: user.walletAddress,
      tokenVersion: user.tokenVersion || 0,
      roles: user.roles ? user.roles.map((r) => r.name) : [],
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '1d' });

    return {
      accessToken,
      expiresIn: 86400,
    };
  }

  /**
   * Revoke a single refresh token on logout
   */
  async logout(refreshTokenStr?: string, userId?: string): Promise<{ success: boolean; message: string }> {
    if (refreshTokenStr) {
      await this.refreshTokenRepository.delete({ token: refreshTokenStr });
    } else if (userId) {
      await this.refreshTokenRepository.delete({ userId });
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * #1158: Revoke all active sessions for authenticated user
   */
  async revokeAll(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RevokeAllResponseDto> {
    const user = await this.userService.findById(userId);

    // Count all active refresh tokens for the user
    const existingTokens = await this.refreshTokenRepository.find({
      where: { userId },
    });
    const revokedSessionsCount = existingTokens.length;

    // Delete all refresh tokens for the user from database
    await this.refreshTokenRepository.delete({ userId });

    // Increment token version in user record (invalidates all existing JWTs)
    const newTokenVersion = await this.userService.incrementTokenVersion(userId);

    // Log action in audit log with eventType: 'sessions_revoked'
    const geo = this.suspiciousDetectionService.getGeoLocation(ipAddress);
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId,
        walletAddress: user.walletAddress,
        ipAddress: ipAddress || null,
        eventType: 'sessions_revoked',
        isSuspicious: false,
        suspiciousReason: null,
        geoCountry: geo.country,
        geoCity: geo.city,
        geoLat: geo.lat,
        geoLon: geo.lon,
        userAgent: userAgent || null,
        metadata: {
          revokedCount: revokedSessionsCount,
          newTokenVersion,
          revokedBy: 'user',
        },
      }),
    );

    // Send notification placeholder to user
    await this.notificationService.sendSessionRevocationNotification(user, revokedSessionsCount);

    return {
      success: true,
      message: 'All active sessions have been successfully revoked across all devices',
      revokedSessionsCount,
      tokenVersion: newTokenVersion,
    };
  }

  /**
   * #1158: Admin endpoint to revoke all sessions for any user
   */
  async adminRevokeAll(
    targetUserId: string,
    adminUser: User,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RevokeAllResponseDto> {
    const targetUser = await this.userService.findById(targetUserId);

    const existingTokens = await this.refreshTokenRepository.find({
      where: { userId: targetUserId },
    });
    const revokedSessionsCount = existingTokens.length;

    // Delete all refresh tokens
    await this.refreshTokenRepository.delete({ userId: targetUserId });

    // Increment token version
    const newTokenVersion = await this.userService.incrementTokenVersion(targetUserId);

    // Log admin audit action
    const geo = this.suspiciousDetectionService.getGeoLocation(ipAddress);
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: targetUserId,
        walletAddress: targetUser.walletAddress,
        ipAddress: ipAddress || null,
        eventType: 'sessions_revoked',
        isSuspicious: false,
        suspiciousReason: null,
        geoCountry: geo.country,
        geoCity: geo.city,
        geoLat: geo.lat,
        geoLon: geo.lon,
        userAgent: userAgent || null,
        metadata: {
          revokedCount: revokedSessionsCount,
          newTokenVersion,
          revokedBy: 'admin',
          adminId: adminUser.id,
        },
      }),
    );

    // Send notification placeholder
    await this.notificationService.sendSessionRevocationNotification(targetUser, revokedSessionsCount);

    return {
      success: true,
      message: `All active sessions revoked for user ${targetUserId}`,
      revokedSessionsCount,
      tokenVersion: newTokenVersion,
    };
  }

  /**
   * Generate Access & Refresh tokens
   */
  private async generateTokens(
    user: User,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const payload = {
      sub: user.id,
      email: user.email,
      walletAddress: user.walletAddress,
      tokenVersion: user.tokenVersion || 0,
      roles: user.roles ? user.roles.map((r) => r.name) : [],
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '1d' });
    const refreshTokenString = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        token: refreshTokenString,
        userId: user.id,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        expiresAt,
      }),
    );

    return {
      accessToken,
      refreshToken: refreshTokenString,
      tokenType: 'Bearer',
      expiresIn: 86400,
      user: UserResponseDto.fromEntity(user),
    };
  }
}
