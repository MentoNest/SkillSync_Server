import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { AuditLogService, RequestAudit } from './audit-log.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { SuspensionService } from './suspension.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/entities/role.entity';
import * as StellarSDK from 'stellar-sdk';
import { verify } from 'stellar-sdk';

type JwtClaims = Record<string, unknown> & {
  sub: string;
  jti?: string;
  typ?: 'access' | 'refresh';
  iat?: number;
  exp?: number;
};

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
};

const JWT_HEADER = { alg: 'HS256', typ: 'JWT' };
const JWT_RESERVED_CLAIMS = new Set(['iat', 'exp', 'nbf', 'jti', 'typ']);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
    private readonly suspensionService: SuspensionService,
  ) {}

  verifyStellarSignature(walletAddress: string, nonce: string, signature: string): boolean {
    try {
      const publicKey = StellarSDK.StrKey.decodeEd25519PublicKey(walletAddress);
      const messageBuffer = Buffer.from(nonce, 'hex');
      const signatureBuffer = Buffer.from(signature, 'base64');
      
      return StellarSDK.verify(messageBuffer, publicKey, signatureBuffer);
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  async loginWithSignature(
    walletAddress: string,
    nonce: string,
    signature: string,
    audit: RequestAudit,
  ): Promise<TokenPair> {
    const isValid = this.verifyStellarSignature(walletAddress, nonce, signature);
    
    if (!isValid) {
      await this.logLoginFailure(walletAddress, audit, 'Invalid signature');
      throw new UnauthorizedException('Invalid signature');
    }

    return this.login(walletAddress, audit);
  }

  async login(walletAddress: string, audit: RequestAudit): Promise<TokenPair> {
    let user = await this.dataSource.manager.findOne(User, {
      where: { walletAddress },
      relations: { roles: true },
    });

    if (!user) {
      // Create new user with default mentee role
      const role = await this.dataSource.manager.findOne(Role, {
        where: { name: 'mentee' },
      });

      user = this.dataSource.manager.create(User, {
        walletAddress,
        roles: role ? [role] : [],
        tokenVersion: 0,
      });
      user = await this.dataSource.manager.save(user);
    }

    const activeSuspension = await this.suspensionService.getActiveSuspension(user.id);
    if (activeSuspension) {
      const untilText = activeSuspension.suspendedUntil
        ? activeSuspension.suspendedUntil.toISOString()
        : 'permanently';
      await this.logLoginFailure(user.walletAddress, audit, 'Account suspended');
      throw new ForbiddenException(
        `Account suspended until ${untilText}: ${activeSuspension.reason}`,
      );
    }

    const claims = {
      sub: user.id,
      walletAddress: user.walletAddress,
      roles: user.roles.map((r) => r.name),
      tokenVersion: user.tokenVersion,
    };

    const tokenPair = await this.issueTokenPair(claims, audit);
    await this.logLoginSuccess(user.id, user.walletAddress, audit);
    return tokenPair;
  }

  async refresh(refreshToken: string, audit: RequestAudit): Promise<TokenPair> {
    let userId: string | null = null;
    try {
      const payload = this.verifyRefreshToken(refreshToken);
      userId = payload.sub;
      const tokenHash = this.hashToken(refreshToken);
      const now = new Date();

      const pair = await this.dataSource.transaction(
        async (manager: EntityManager) => {
          const token = await manager.findOne(RefreshToken, {
            where: { tokenHash },
            lock: { mode: 'pessimistic_write' },
          });

          if (!token) {
            throw new UnauthorizedException('Invalid refresh token');
          }

          if (token.expiresAt.getTime() <= now.getTime()) {
            throw new UnauthorizedException('Refresh token has expired');
          }

          if (token.revokedAt) {
            await this.handleRefreshTokenReuse(manager, token, audit);
            throw new UnauthorizedException('Refresh token has been revoked');
          }

          if (token.userId !== payload.sub) {
            throw new UnauthorizedException(
              'Refresh token does not match the authenticated user',
            );
          }

          const user = await manager.findOne(User, {
            where: { id: token.userId },
            relations: { roles: true },
          });

          if (!user) {
            throw new UnauthorizedException('User not found');
          }

          const activeSuspension = await this.suspensionService.getActiveSuspension(user.id);
          if (activeSuspension) {
            const untilText = activeSuspension.suspendedUntil
              ? activeSuspension.suspendedUntil.toISOString()
              : 'permanently';
            throw new ForbiddenException(
              `Account suspended until ${untilText}: ${activeSuspension.reason}`,
            );
          }

          if (payload.tokenVersion !== user.tokenVersion) {
            throw new UnauthorizedException('Token version mismatch');
          }

          const coreClaims = this.getCoreClaims(payload);
          const userClaims = {
            ...coreClaims,
            roles: user.roles.map((r) => r.name),
            tokenVersion: user.tokenVersion,
            walletAddress: token.walletAddress,
          };
          const nextPair = this.createSignedTokenPair(userClaims);
          const replacement = this.refreshTokenRepository.create({
            tokenHash: this.hashToken(nextPair.refreshToken),
            userId: token.userId,
            walletAddress: token.walletAddress,
            familyId: token.familyId,
            expiresAt: new Date(Date.now() + nextPair.refreshExpiresIn * 1000),
            revokedAt: null,
            replacedByTokenId: null,
            userAgent: this.normalizeHeader(audit.userAgent),
            ipAddress: audit.ipAddress,
            deviceFingerprint: audit.deviceFingerprint,
            lastUsedAt: null,
            concurrentReuseDetectedAt: null,
          });

          const savedReplacement = await manager.save(
            RefreshToken,
            replacement,
          );
          token.revokedAt = now;
          token.replacedByTokenId = savedReplacement.id;
          token.lastUsedAt = now;
          await manager.save(RefreshToken, token);

          return nextPair;
        },
      );

      await this.auditLogService.logRefreshTokenUsage({
        userId,
        success: true,
        audit,
      });

      return pair;
    } catch (error) {
      await this.auditLogService.logRefreshTokenUsage({
        userId,
        success: false,
        reason:
          error instanceof Error ? error.message : 'Unknown refresh failure',
        audit,
      });
      throw error;
    }
  }

  async issueTokenPair(
    claims: JwtClaims,
    audit: RequestAudit,
  ): Promise<TokenPair> {
    const pair = this.createSignedTokenPair(claims);
    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        tokenHash: this.hashToken(pair.refreshToken),
        userId: claims.sub,
        walletAddress:
          this.getStringClaim(claims, 'walletAddress') ??
          this.getStringClaim(claims, 'address'),
        expiresAt: new Date(Date.now() + pair.refreshExpiresIn * 1000),
        revokedAt: null,
        replacedByTokenId: null,
        userAgent: this.normalizeHeader(audit.userAgent),
        ipAddress: audit.ipAddress,
        deviceFingerprint: audit.deviceFingerprint,
        lastUsedAt: null,
        concurrentReuseDetectedAt: null,
      }),
    );

    return pair;
  }

  async logLoginSuccess(
    userId: string,
    walletAddress: string | null,
    audit: RequestAudit,
  ): Promise<void> {
    await this.auditLogService.logLoginSuccess({
      userId,
      walletAddress,
      audit,
    });
  }

  async logLoginFailure(
    attemptedWalletAddress: string,
    audit: RequestAudit,
    reason?: string,
  ): Promise<void> {
    await this.auditLogService.logLoginFailure({
      attemptedWalletAddress,
      reason,
      audit,
    });
  }

  async logLogout(userId: string, audit: RequestAudit): Promise<void> {
    await this.auditLogService.logLogout({ userId, audit });
  }

  async logPasswordEquivalentChange(
    userId: string,
    audit: RequestAudit,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogService.logPasswordEquivalentChange({
      userId,
      audit,
      details,
    });
  }

  async logRoleAssignment(
    userId: string,
    assignedRole: string,
    audit: RequestAudit,
    assignedByUserId?: string,
  ): Promise<void> {
    await this.auditLogService.logRoleAssignment({
      userId,
      assignedRole,
      assignedByUserId,
      audit,
    });
  }

  private async handleRefreshTokenReuse(
    manager: EntityManager,
    token: RefreshToken,
    audit: RequestAudit,
  ): Promise<void> {
    const now = new Date();
    token.concurrentReuseDetectedAt ??= now;
    await manager.save(RefreshToken, token);
    await manager.update(
      RefreshToken,
      { familyId: token.familyId, revokedAt: IsNull() },
      { revokedAt: now, concurrentReuseDetectedAt: now },
    );

    this.logger.warn({
      message: 'Concurrent refresh token reuse detected',
      refreshTokenId: token.id,
      userId: token.userId,
      familyId: token.familyId,
      ipAddress: audit.ipAddress,
      userAgent: this.normalizeHeader(audit.userAgent),
      deviceFingerprint: audit.deviceFingerprint,
    });
  }

  private createSignedTokenPair(coreClaims: JwtClaims): TokenPair {
    const accessExpiresIn = this.getDurationSeconds(
      'JWT_ACCESS_TOKEN_TTL',
      '15m',
    );
    const refreshExpiresIn = this.getDurationSeconds(
      'JWT_REFRESH_TOKEN_TTL',
      '30d',
    );

    return {
      accessToken: this.signJwt(
        { ...coreClaims, typ: 'access', jti: randomUUID() },
        accessExpiresIn,
        this.accessSecret,
      ),
      refreshToken: this.signJwt(
        { ...coreClaims, typ: 'refresh', jti: randomUUID() },
        refreshExpiresIn,
        this.refreshSecret,
      ),
      tokenType: 'Bearer',
      expiresIn: accessExpiresIn,
      refreshExpiresIn,
    };
  }

  private verifyRefreshToken(token: string): JwtClaims {
    const payload = this.verifyJwt(token, this.refreshSecret);
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid refresh token claims');
    }

    return payload;
  }

  private signJwt(
    payload: JwtClaims,
    expiresInSeconds: number,
    secret: string,
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const body = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
    };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(JWT_HEADER));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(body));
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`, secret);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private verifyJwt(token: string, secret: string): JwtClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    let header: typeof JWT_HEADER;
    try {
      header = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString('utf8'),
      ) as typeof JWT_HEADER;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (header.alg !== JWT_HEADER.alg || header.typ !== JWT_HEADER.typ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const expectedSignature = this.sign(
      `${encodedHeader}.${encodedPayload}`,
      secret,
    );
    if (!this.safeEquals(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let payload: JwtClaims;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as JwtClaims;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    return payload;
  }

  private sign(value: string, secret: string): string {
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private safeEquals(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    return (
      aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer)
    );
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.refreshTokenHashSecret)
      .update(token)
      .digest('hex');
  }

  private getCoreClaims(payload: JwtClaims): JwtClaims {
    return Object.fromEntries(
      Object.entries(payload).filter(([key]) => !JWT_RESERVED_CLAIMS.has(key)),
    ) as JwtClaims;
  }

  private getStringClaim(claims: JwtClaims, key: string): string | null {
    const value = claims[key];
    return typeof value === 'string' ? value : null;
  }

  private normalizeHeader(value: string | string[] | null): string | null {
    if (Array.isArray(value)) {
      return value.join(', ');
    }

    return value;
  }

  private getDurationSeconds(key: string, fallback: string): number {
    const value = this.configService.get<string>(key) ?? fallback;
    const match = /^(\d+)([smhd])?$/.exec(value);
    if (!match) {
      throw new Error(`${key} must be a duration like 900, 15m, 12h, or 30d`);
    }

    const amount = Number(match[1]);
    const unit = match[2] ?? 's';
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };

    return amount * multipliers[unit as keyof typeof multipliers];
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value).toString('base64url');
  }

  private get accessSecret(): string {
    return (
      this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET') ??
      this.jwtSecret
    );
  }

  private get refreshSecret(): string {
    return (
      this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET') ??
      this.jwtSecret
    );
  }

  private get refreshTokenHashSecret(): string {
    return (
      this.configService.get<string>('REFRESH_TOKEN_HASH_SECRET') ??
      this.refreshSecret
    );
  }

  private get jwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (secret) {
      return secret;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be configured in production');
    }

    return 'development-only-change-me';
  }
}
