import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { AuditLog } from './entities/audit-log.entity.js';
import { UserService } from '../user/user.service.js';
import { User, ProfileType, UserStatus } from '../user/entities/user.entity.js';
import { RedisService } from './services/redis.service.js';
import { NotificationService } from './services/notification.service.js';
import { SuspiciousDetectionService } from './services/suspicious-detection.service.js';
import { WalletStrategy } from './strategies/wallet.strategy.js';
import { LoginDto, StellarNetwork } from './dto/login.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { NonceResponseDto } from './dto/nonce-response.dto.js';
import { RevokeAllResponseDto } from './dto/revoke-all-response.dto.js';
import { UserResponseDto } from '../user/dto/user-response.dto.js';
import { normalizeWalletAddress } from '../common/utils/wallet.utils.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly notificationService: NotificationService,
    private readonly suspiciousDetectionService: SuspiciousDetectionService,
    private readonly walletStrategy: WalletStrategy,
    private readonly nonceService: NonceService,
    private readonly accessTokenService: AccessTokenService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {
    // #1316: reuse of a rotated refresh token is a security event, so it is
    // reported through the audit log and the notification service.
    this.refreshTokenService.onReuseDetected = async (event) => {
      await this.recordSessionAudit({
        userId: event.userId,
        eventType: 'refresh_token_reuse_detected',
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        isSuspicious: true,
        details: {
          familyId: event.familyId,
          reusedTokenId: event.reusedTokenId,
          revokedSessionsCount: event.revokedSessionsCount,
        },
      });
    };
  }

  /**
   * #1313: Generate one-time cryptographic nonce challenge for Stellar wallet authentication.
   * The nonce is a 256-bit random value (hex encoded) stored in Redis under
   * `nonce:{walletAddress}` with a 5 minute TTL. Requesting a new nonce for the
   * same wallet overwrites (invalidates) any previously issued unused nonce.
   */
  async generateNonce(walletAddress: string): Promise<NonceResponseDto> {
    // normalizeWalletAddress() trims, validates the StrKey checksum and
    // canonicalises to lowercase, so the Redis nonce key is always identical
    // for the same wallet regardless of how the caller cased it.
    const normalizedAddress = normalizeWalletAddress(walletAddress);
    const nonce = crypto.randomBytes(32).toString('hex'); // 256 bits of entropy
    const expiresAt = new Date(Date.now() + AuthService.NONCE_TTL_SECONDS * 1000);

    await this.redisService.set(
      `nonce:${normalizedAddress}`,
      JSON.stringify({ nonce, expiresAt: expiresAt.toISOString() }),
      AuthService.NONCE_TTL_SECONDS,
    );

    return {
      walletAddress: issued.walletAddress,
      nonce: issued.nonce,
      expiresAt: issued.expiresAt,
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
      user = await this.loginWithWalletSignature(loginDto, ipAddress, userAgent);
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

    // #1174: reject login by a soft-deleted user with reactivation instructions
    if (user.status === UserStatus.DELETED) {
      const graceDays = parseInt(process.env.DELETE_GRACE_DAYS || '', 10) || 30;
      const deadline = user.deletedAt
        ? new Date(user.deletedAt.getTime() + graceDays * 24 * 60 * 60 * 1000)
        : null;

      if (deadline && new Date() < deadline) {
        throw new ForbiddenException({
          statusCode: 403,
          message: `This account was deleted. You can restore it until ${deadline.toISOString()} by logging in again and calling POST /user/account/restore.`,
          code: 'account_deleted_restorable',
          restoreDeadline: deadline,
        });
      }

      throw new ForbiddenException({
        statusCode: 403,
        message: 'This account has been permanently deleted.',
        code: 'account_deleted',
      });
    }

    // #1175: reject login by a suspended user with reason + expected end date.
    // A temporary suspension whose window has passed is auto-lifted here.
    if (user.status === UserStatus.SUSPENDED) {
      const activeSuspension = await this.userService.checkAndExpireSuspension(user);
      if (activeSuspension) {
        throw new ForbiddenException({
          statusCode: 403,
          message: activeSuspension.suspendedUntil
            ? `Your account is suspended until ${new Date(activeSuspension.suspendedUntil).toISOString()}. Reason: ${activeSuspension.reason}`
            : `Your account is permanently suspended. Reason: ${activeSuspension.reason}`,
          code: 'account_suspended',
          reason: activeSuspension.reason,
          suspendedUntil: activeSuspension.suspendedUntil,
        });
      }
      // else: suspension auto-expired, user.status was flipped back to 'active' - fall through
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
   * #1314: Verify a Stellar wallet signature over the issued nonce.
   * - The challenge is taken out of Redis atomically (`GETDEL`), so a single
   *   nonce can back exactly one verification attempt even under concurrency.
   * - Expiration is checked before the signature is verified.
   * - The client supplied nonce is compared in constant time.
   * - Invalid signatures return 401 Unauthorized with a clear message.
   * - Successful verification creates/retrieves the user account automatically.
   * - Every attempt (success/failure) is recorded in the audit log.
   */
  private async loginWithWalletSignature(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<User> {
    const normalizedWallet = normalizeWalletAddress(loginDto.walletAddress!);
    const redisKey = `nonce:${normalizedWallet}`;
    const network = loginDto.network || StellarNetwork.MAINNET;

    const fail = async (message: string, reason: string): Promise<never> => {
      await this.recordLoginAudit({
        walletAddress: normalizedWallet,
        ipAddress,
        userAgent,
        eventType: 'login_failed',
        network,
        reason,
      });
      await this.suspiciousDetectionService.recordFailedLogin({
        walletAddress: normalizedWallet,
        ipAddress,
        userAgent,
        reason,
      });
      throw new UnauthorizedException(message);
    };

    if (!loginDto.signature) {
      return fail(
        'Cryptographic signature is required for wallet login',
        'MISSING_WALLET_SIGNATURE',
      );
    }

    // Taking the nonce deletes it, whatever happens below (replay protection).
    const consumed = await this.nonceService.consume(normalizedWallet);

    if (consumed.status !== 'ok') {
      const reason = {
        missing: 'NONCE_EXPIRED_OR_MISSING',
        expired: 'NONCE_EXPIRED',
        corrupted: 'NONCE_CORRUPTED',
      }[consumed.status];
      return fail(
        consumed.status === 'expired'
          ? 'Nonce has expired. Request a new nonce via GET /auth/nonce/:walletAddress'
          : 'Nonce expired or not found. Request a new nonce via GET /auth/nonce/:walletAddress',
        reason,
      );
    }

    if (consumed.nonce.purpose !== NonceService.PURPOSE_LOGIN) {
      return fail('The provided nonce was issued for a different purpose', 'NONCE_PURPOSE_MISMATCH');
    }

    if (!NonceService.matches(consumed.nonce.nonce, loginDto.nonce)) {
      return fail('Provided nonce does not match the issued challenge', 'NONCE_MISMATCH');
    }

    if (!this.walletStrategy.isValidAddress(normalizedWallet)) {
      return fail('Invalid Stellar wallet address', 'INVALID_WALLET_ADDRESS');
    }

    // Recover the public key from the address (G or SEP-23 muxed form) and let
    // the Ed25519 verification decide; a G and an M address for the same
    // underlying account both work.
    const signatureValid = this.walletStrategy.verifySignature(
      normalizedWallet,
      consumed.nonce.nonce,
      loginDto.signature,
    );
    if (!signatureValid) {
      return fail(
        'Invalid wallet signature. Signature verification failed for the provided nonce',
        'INVALID_SIGNATURE',
      );
    }

    // Retrieve or auto-provision the user account
    let user = await this.userService.findByWalletAddress(normalizedWallet);
    if (!user) {
      const created = await this.userService.create({
        walletAddress: normalizedWallet,
        profileType: ProfileType.MENTEE,
      });
      user = await this.userService.findById(created.id);
    }

    await this.recordLoginAudit({
      walletAddress: normalizedWallet,
      userId: user.id,
      ipAddress,
      userAgent,
      eventType: 'login_success',
      network,
    });

    return user;
  }

  /**
   * #1147: Create an audit log entry for each wallet login attempt.
   */
  private async recordLoginAudit(params: {
    walletAddress: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    eventType: 'login_success' | 'login_failed';
    network: StellarNetwork;
    reason?: string;
  }): Promise<void> {
    const geo = this.suspiciousDetectionService.getGeoLocation(params.ipAddress);
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: params.userId || null,
        walletAddress: params.walletAddress,
        ipAddress: params.ipAddress || null,
        eventType: params.eventType,
        isSuspicious: params.eventType === 'login_failed',
        suspiciousReason: params.reason || null,
        geoCountry: geo.country,
        geoCity: geo.city,
        geoLat: geo.lat,
        geoLon: geo.lon,
        userAgent: params.userAgent || null,
        metadata: { method: 'stellar_wallet', network: params.network, reason: params.reason || null },
      }),
    );
  }

  /**
   * #1315, #1316: audit entry for session lifecycle events that are not wallet
   * logins - token rotation and the security alert raised on token reuse.
   */
  private async recordSessionAudit(params: {
    userId: string;
    walletAddress?: string | null;
    ipAddress?: string;
    userAgent?: string;
    eventType: 'refresh_token_rotated' | 'refresh_token_reuse_detected';
    isSuspicious?: boolean;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const geo = this.suspiciousDetectionService.getGeoLocation(params.ipAddress);
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: params.userId,
        walletAddress: params.walletAddress ?? null,
        ipAddress: params.ipAddress || null,
        eventType: params.eventType,
        isSuspicious: params.isSuspicious ?? false,
        suspiciousReason: params.isSuspicious ? params.eventType : null,
        geoCountry: geo.country,
        geoCity: geo.city,
        geoLat: geo.lat,
        geoLon: geo.lon,
        userAgent: params.userAgent || null,
        metadata: params.details ?? {},
      }),
    );
  }

  /**
   * #1316: exchange a refresh token for a new pair.
   *
   * The presented token is rotated: it is revoked, linked to its replacement,
   * and a brand new refresh token is returned. Presenting an already rotated
   * token is treated as a compromise (see RefreshTokenService.handleReuse) and
   * ends every session of the account.
   */
  async refresh(
    refreshTokenStr: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RefreshResponseDto> {
    const outcome = await this.refreshTokenService.rotate(refreshTokenStr, {
      ipAddress,
      userAgent,
    });

    if (!outcome) {
      // Unknown, expired, revoked or replayed: the same message in every case,
      // so the endpoint cannot be used to probe which tokens exist.
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { consumed, result } = outcome;
    const user = await this.userService.findById(consumed.userId);

    if (!user || user.isLocked) {
      throw new ForbiddenException('Account is inactive or locked');
    }

    await this.recordSessionAudit({
      userId: user.id,
      walletAddress: user.walletAddress,
      ipAddress,
      userAgent,
      eventType: 'refresh_token_rotated',
      details: {
        rotationCount: result.rotationCount,
        deviceChanged: result.deviceChanged,
      },
    });

    return result;
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
   * #1315, #1316: issue the access/refresh pair for a successful login.
   *
   * The access token carries the core claims (`sub`, `wallet`, `roles`,
   * `permissions`, `jti`, `tokenVersion`) with the configured algorithm and
   * lifetime; the refresh token is a JWT with the same core claims plus
   * `typ: 'refresh'`, stored alongside the device it was issued to.
   */
  private async generateTokens(
    user: User,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const access = this.accessTokenService.issueAccessToken(user);
    const refresh = await this.refreshTokenService.issueForLogin(user, {
      ipAddress,
      userAgent,
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      expiresIn: access.expiresIn,
      refreshExpiresIn: refresh.refreshExpiresIn,
      user: UserResponseDto.fromEntity(user),
    };
  }
}
