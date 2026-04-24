import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { verifyMessage } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { User, UserRole } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuditLog, AuditEventType } from './entities/audit-log.entity';
import { RedisService } from '../../redis/redis.service';
import { normalizeWalletAddress } from '../../common/utils/wallet.utils';

export interface JwtPayload {
  sub: string;
  walletAddress: string;
  roles: string[];
  permissions: string[];
  jti: string;
  tokenVersion: number;
  type?: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private nonceStore = new Map<string, { nonce: string; expiresAt: number }>();
  private readonly TOKEN_BLACKLIST_PREFIX = 'blacklist:token';
  private readonly USER_SESSIONS_PREFIX = 'user:sessions';

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Generate a nonce for wallet authentication
   */
  async generateNonce(walletAddress: string): Promise<string> {
    // Normalize wallet address for consistent storage and comparison
    const normalizedAddress = normalizeWalletAddress(walletAddress);
    
    const nonce = uuidv4();
    
    // Store nonce with 5 minute expiration using normalized address
    this.nonceStore.set(normalizedAddress, {
      nonce,
      expiresAt: Date.now() + 300000, // 5 minutes
    });
    
    this.logger.log(`Generated nonce for wallet: ${normalizedAddress}`);
    return nonce;
  }

  /**
   * Verify wallet signature
   */
  async verifySignature(
    walletAddress: string,
    signature: string,
    nonce: string,
  ): Promise<boolean> {
    try {
      // Normalize wallet address for comparison
      const normalizedAddress = normalizeWalletAddress(walletAddress);
      
      // Reconstruct the message that was signed
      const message = `Sign this message to authenticate with SkillSync. Nonce: ${nonce}`;
      
      // Recover the address from the signature
      const recoveredAddress = verifyMessage(message, signature);
      
      // Check if recovered address matches the normalized address
      return recoveredAddress.toLowerCase() === normalizedAddress.toLowerCase();
    } catch (error) {
      this.logger.error('Signature verification failed', error);
      return false;
    }
  }

  /**
   * Login with wallet authentication
   */
  async login(loginDto: LoginDto, userAgent?: string, ipAddress?: string) {
    const { walletAddress, signature, nonce } = loginDto;

    // Normalize wallet address for consistent storage and comparison
    const normalizedAddress = normalizeWalletAddress(walletAddress);

    // Verify nonce
    const storedNonceData = this.nonceStore.get(normalizedAddress);

    if (!storedNonceData || storedNonceData.nonce !== nonce) {
      throw new UnauthorizedException('Invalid or expired nonce');
    }

    // Check if nonce is expired
    if (Date.now() > storedNonceData.expiresAt) {
      this.nonceStore.delete(normalizedAddress);
      throw new UnauthorizedException('Nonce expired');
    }

    // Verify signature
    const isValidSignature = await this.verifySignature(
      normalizedAddress,
      signature,
      nonce,
    );

    if (!isValidSignature) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Delete used nonce
    this.nonceStore.delete(normalizedAddress);

    // Find or create user
    let user = await this.userRepository.findOne({
      where: { walletAddress: normalizedAddress },
      relations: ['roles'],
    });

    if (!user) {
      user = this.userRepository.create({
        walletAddress: normalizedAddress,
        tokenVersion: 1,
      });

      // Assign default mentee role
      let menteeRole = await this.roleRepository.findOne({
        where: { name: UserRole.MENTEE },
      });

      if (!menteeRole) {
        menteeRole = this.roleRepository.create({
          name: UserRole.MENTEE,
          description: 'Default mentee role',
        });
        await this.roleRepository.save(menteeRole);
      }

      user.roles = [menteeRole];
      await this.userRepository.save(user);
    }

    // Get user roles and permissions
    const roles = user.roles.map((role) => role.name);
    const permissions = this.getPermissionsForRoles(roles);

    // Generate JWT tokens
    const tokens = await this.generateTokens(user, roles, permissions);

    // Store refresh token in database
    const deviceFingerprint = this.generateDeviceFingerprint(
      normalizedAddress,
      userAgent,
    );

    await this.storeRefreshToken({
      token: tokens.refreshToken,
      userId: user.id,
      deviceFingerprint,
      userAgent,
      ipAddress,
      expiresAt: new Date(
        Date.now() +
          this.parseExpirationToMs(
            this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
          ),
      ),
    });

    // Audit log
    this.logger.log(`User logged in: ${normalizedAddress}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        roles: roles,
        permissions: permissions,
      },
    };
  }

  /**
   * Refresh access token with rotation
   */
  async refreshTokens(refreshDto: RefreshDto, userAgent?: string, ipAddress?: string) {
    const { refreshToken, deviceFingerprint } = refreshDto;

    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      }) as JwtPayload;

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Check if token is blacklisted
      const isBlacklisted = await this.redisService.exists(
        `${this.TOKEN_BLACKLIST_PREFIX}:${refreshToken}`,
      );

      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }

      // Find refresh token in database
      const storedToken = await this.refreshTokenRepository.findOne({
        where: { token: refreshToken },
        relations: ['user', 'user.roles'],
      });

      if (!storedToken || storedToken.isRevoked) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if token expired
      if (new Date() > storedToken.expiresAt) {
        throw new UnauthorizedException('Refresh token expired');
      }

      // Concurrent refresh detection - security alert
      const timeDiff = Date.now() - storedToken.createdAt.getTime();
      if (timeDiff < 1000) {
        this.logger.warn(
          `Concurrent refresh token use detected for user ${storedToken.userId}`,
        );
        // Revoke all tokens for security
        await this.revokeAllUserTokens(storedToken.userId);
        throw new UnauthorizedException(
          'Security alert: Concurrent token use detected',
        );
      }

      // Revoke old refresh token (rotation)
      storedToken.isRevoked = true;
      await this.refreshTokenRepository.save(storedToken);

      // Blacklist old refresh token
      await this.blacklistToken(
        refreshToken,
        this.parseExpirationToMs(
          this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
        ),
      );

      // Get user with roles
      const user = storedToken.user;
      const roles = user.roles.map((role) => role.name);
      const permissions = this.getPermissionsForRoles(roles);

      // Generate new tokens
      const tokens = await this.generateTokens(user, roles, permissions);

      // Store new refresh token
      const fingerprint = deviceFingerprint || storedToken.deviceFingerprint;
      await this.storeRefreshToken({
        token: tokens.refreshToken,
        userId: user.id,
        deviceFingerprint: fingerprint,
        userAgent: userAgent || storedToken.userAgent,
        ipAddress: ipAddress || storedToken.ipAddress,
        expiresAt: new Date(
          Date.now() +
            this.parseExpirationToMs(
              this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
            ),
        ),
      });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout and invalidate tokens
   */
  async logout(accessToken: string, userId: string): Promise<void> {
    // Blacklist access token until expiration
    const decoded = this.jwtService.decode(accessToken) as JwtPayload;
    if (decoded && decoded.exp) {
      const ttlMs = decoded.exp * 1000 - Date.now();
      if (ttlMs > 0) {
        await this.blacklistToken(accessToken, ttlMs);
      }
    }

    // Delete refresh tokens from database
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );

    // Remove user sessions from Redis
    await this.redisService.del(`${this.USER_SESSIONS_PREFIX}:${userId}`);

    // Audit log
    this.logger.log(`User logged out: ${userId}`);
  }

  /**
   * Logout all sessions for a user
   */
  async logoutAll(userId: string): Promise<void> {
    // Increment token version to invalidate all access tokens
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user) {
      user.tokenVersion += 1;
      await this.userRepository.save(user);
    }

    // Revoke all refresh tokens
    await this.revokeAllUserTokens(userId);

    // Clear user sessions
    await this.redisService.del(`${this.USER_SESSIONS_PREFIX}:${userId}`);

    this.logger.log(`All sessions logged out for user: ${userId}`);
  }

  /**
   * Revoke all sessions (rate-limited: 3/hour per user)
   */
  async revokeAll(userId: string): Promise<{ message: string; revokedCount: number }> {
    const rateLimitKey = `revoke-all:${userId}`;
    const count = await this.redisService.incr(rateLimitKey);
    if (count === 1) {
      await this.redisService.expire(rateLimitKey, 3600);
    }
     if (count > 3) {
       throw new HttpException('Rate limit exceeded: 3 requests per hour', HttpStatus.TOO_MANY_REQUESTS);
     }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    // Increment token version — invalidates all existing JWTs
    user.tokenVersion += 1;
    await this.userRepository.save(user);

    // Revoke all refresh tokens and count them
    const result = await this.refreshTokenRepository
      .createQueryBuilder()
      .update()
      .set({ isRevoked: true })
      .where('userId = :userId AND isRevoked = false', { userId })
      .returning('id')
      .execute();
    const revokedCount = result.affected ?? 0;

    // Clear Redis sessions
    await this.redisService.del(`${this.USER_SESSIONS_PREFIX}:${userId}`);

    // Audit log
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId,
        walletAddress: user.walletAddress,
        eventType: AuditEventType.SESSIONS_REVOKED,
        ipAddress: 'system',
        metadata: { revokedCount },
      }),
    );

    this.logger.log(`All sessions revoked for user: ${userId} (${revokedCount} tokens)`);
    return { message: 'All sessions revoked', revokedCount };
  }

  /**
   * Validate JWT token payload
   */
  async validateToken(payload: JwtPayload) {
    // Check if token is blacklisted
    const isBlacklisted = await this.redisService.exists(
      `${this.TOKEN_BLACKLIST_PREFIX}:${payload.jti}`,
    );

    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Verify user exists and token version matches
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['roles'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check token version
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Token version mismatch');
    }

    const roles = user.roles.map((role) => role.name);
    const permissions = this.getPermissionsForRoles(roles);

    return {
      userId: payload.sub,
      walletAddress: payload.walletAddress,
      roles: roles,
      permissions: permissions,
    };
  }

  /**
   * Get user profile
   */
  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const roles = user.roles.map((role) => role.name);
    const permissions = this.getPermissionsForRoles(roles);

    return {
      id: user.id,
      walletAddress: user.walletAddress,
      roles: roles,
      permissions: permissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(
    user: User,
    roles: string[],
    permissions: string[],
  ) {
    const jti = uuidv4();

    const payload: JwtPayload = {
      sub: user.id,
      walletAddress: user.walletAddress,
      roles,
      permissions,
      jti,
      tokenVersion: user.tokenVersion,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn:
        (this.configService.get<string>('JWT_ACCESS_EXPIRATION') ||
        this.configService.get<string>('JWT_EXPIRES_IN') ||
        '15m') as any,
    });

    const refreshPayload: JwtPayload = {
      ...payload,
      type: 'refresh',
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn:
        (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d') as any,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Store refresh token in database
   */
  private async storeRefreshToken(tokenData: {
    token: string;
    userId: string;
    deviceFingerprint?: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
  }) {
    const refreshToken = this.refreshTokenRepository.create(tokenData);
    await this.refreshTokenRepository.save(refreshToken);
  }

  /**
   * Blacklist a token in Redis
   */
  private async blacklistToken(token: string, ttlMs: number) {
    const ttlSeconds = Math.ceil(ttlMs / 1000);
    await this.redisService.set(
      `${this.TOKEN_BLACKLIST_PREFIX}:${token}`,
      'blacklisted',
      ttlSeconds,
    );
  }

  /**
   * Revoke all refresh tokens for a user
   */
  private async revokeAllUserTokens(userId: string) {
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
  }

  /**
   * Get permissions for roles
   */
  private getPermissionsForRoles(roles: string[]): string[] {
    const permissionMap: Record<string, string[]> = {
      [UserRole.ADMIN]: [
        'read:all',
        'write:all',
        'delete:all',
        'manage:users',
        'manage:roles',
        'manage:sessions',
      ],
      [UserRole.MENTOR]: [
        'read:profile',
        'write:profile',
        'read:sessions',
        'write:sessions',
        'read:mentees',
      ],
      [UserRole.MENTEE]: [
        'read:profile',
        'write:profile',
        'read:sessions',
        'read:mentors',
      ],
      [UserRole.MODERATOR]: [
        'read:all',
        'write:content',
        'moderate:content',
      ],
    };

    const permissions = new Set<string>();
    for (const role of roles) {
      const rolePermissions = permissionMap[role] || [];
      rolePermissions.forEach((perm) => permissions.add(perm));
    }

    return Array.from(permissions);
  }

  /**
   * Generate device fingerprint
   */
  private generateDeviceFingerprint(
    walletAddress: string,
    userAgent?: string,
  ): string {
    const data = `${walletAddress}:${userAgent || 'unknown'}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Parse expiration string to milliseconds
   */
  private parseExpirationToMs(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000; // Default 7 days
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Admin: Assign role to user
   */
  async assignRole(adminUserId: string, userId: string, roleName: string) {
    // Verify admin has permission
    const admin = await this.userRepository.findOne({
      where: { id: adminUserId },
      relations: ['roles'],
    });

    const adminRoles = admin.roles.map((r) => r.name);
    if (!adminRoles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException('Only admins can assign roles');
    }

    // Find user and role
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    let role = await this.roleRepository.findOne({ where: { name: roleName } });

    if (!role) {
      role = this.roleRepository.create({
        name: roleName,
        description: `Dynamically created ${roleName} role`,
      });
      await this.roleRepository.save(role);
    }

    // Add role to user
    if (!user.roles.find((r) => r.name === roleName)) {
      user.roles.push(role);
      await this.userRepository.save(user);

      // Increment token version to invalidate existing tokens
      user.tokenVersion += 1;
      await this.userRepository.save(user);
    }

    return {
      message: `Role ${roleName} assigned to user`,
      userId: user.id,
      roles: user.roles.map((r) => r.name),
    };
  }

  /**
   * Admin: Revoke role from user
   */
  async revokeRole(adminUserId: string, userId: string, roleName: string) {
    // Verify admin has permission
    const admin = await this.userRepository.findOne({
      where: { id: adminUserId },
      relations: ['roles'],
    });

    const adminRoles = admin.roles.map((r) => r.name);
    if (!adminRoles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException('Only admins can revoke roles');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    user.roles = user.roles.filter((r) => r.name !== roleName);
    await this.userRepository.save(user);

    // Increment token version
    user.tokenVersion += 1;
    await this.userRepository.save(user);

    return {
      message: `Role ${roleName} revoked from user`,
      userId: user.id,
      roles: user.roles.map((r) => r.name),
    };
  }
}
