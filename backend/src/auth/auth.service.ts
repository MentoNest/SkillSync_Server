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
import { WalletStrategy } from './strategies/wallet.strategy';
import { LoginDto, StellarNetwork } from './dto/login.dto';
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
    private readonly walletStrategy: WalletStrategy,
  ) {}

  private static readonly NONCE_TTL_SECONDS = 300; // 5 minutes

  /**
   * #1146: Generate one-time cryptographic nonce challenge for Stellar wallet authentication.
   * The nonce is a 256-bit random value (hex encoded) stored in Redis under
   * `nonce:{walletAddress}` with a 5 minute TTL. Requesting a new nonce for the
   * same wallet overwrites (invalidates) any previously issued unused nonce.
   */
  async generateNonce(walletAddress: string): Promise<NonceResponseDto> {
    if (!this.walletStrategy.isValidAddress(walletAddress)) {
      throw new BadRequestException('Valid Stellar wallet address (56-character G-address) is required');
    }

    const normalizedAddress = walletAddress.trim().toLowerCase();
    const nonce = crypto.randomBytes(32).toString('hex'); // 256 bits of entropy
    const expiresAt = new Date(Date.now() + AuthService.NONCE_TTL_SECONDS * 1000);

    await this.redisService.set(
      `nonce:${normalizedAddress}`,
      JSON.stringify({ nonce, expiresAt: expiresAt.toISOString() }),
      AuthService.NONCE_TTL_SECONDS,
    );

    return {
      walletAddress: normalizedAddress,
      nonce,
      expiresAt,
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
   * #1147: Verify a Stellar wallet signature over the issued nonce.
   * - Expiration is checked before verification (expired nonces are rejected).
   * - The used nonce is deleted from Redis immediately after the verification
   *   attempt (regardless of outcome) to prevent replay attacks.
   * - Invalid signatures return 401 Unauthorized with a clear message.
   * - Successful verification creates/retrieves the user account automatically.
   * - Every attempt (success/failure) is recorded in the audit log.
   */
  private async loginWithWalletSignature(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<User> {
    const normalizedWallet = loginDto.walletAddress!.trim().toLowerCase();
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

    // Nonce expiration is checked before any signature verification
    const storedRaw = await this.redisService.get(redisKey);
    if (!storedRaw) {
      return fail('Nonce expired or not found. Request a new nonce via GET /auth/nonce/:walletAddress', 'NONCE_EXPIRED_OR_MISSING');
    }

    let storedNonce: { nonce: string; expiresAt: string };
    try {
      storedNonce = JSON.parse(storedRaw);
    } catch {
      return fail('Nonce expired or not found. Request a new nonce via GET /auth/nonce/:walletAddress', 'NONCE_CORRUPTED');
    }

    // Invalidate the nonce immediately after this verification attempt (replay protection)
    await this.redisService.del(redisKey);

    if (!storedNonce?.nonce || new Date(storedNonce.expiresAt).getTime() <= Date.now()) {
      return fail('Nonce has expired. Request a new nonce via GET /auth/nonce/:walletAddress', 'NONCE_EXPIRED');
    }

    if (loginDto.nonce && loginDto.nonce !== storedNonce.nonce) {
      return fail('Provided nonce does not match the issued challenge', 'NONCE_MISMATCH');
    }

    if (!loginDto.signature) {
      return fail('Cryptographic signature is required for wallet login', 'MISSING_WALLET_SIGNATURE');
    }

    // Recover/verify the signature with the Stellar SDK (StrKey + Keypair.verify)
    const signatureValid = this.walletStrategy.verifySignature(
      normalizedWallet,
      storedNonce.nonce,
      loginDto.signature,
    );
    if (!signatureValid) {
      return fail('Invalid wallet signature. Signature verification failed for the provided nonce', 'INVALID_SIGNATURE');
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
