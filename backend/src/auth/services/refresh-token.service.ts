import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../../user/entities/user.entity';
import { AccessTokenService, type AccessTokenClaims, type RefreshTokenClaims } from './access-token.service';
import { getAuthTokenConfig, type AuthTokenConfig } from '../config/auth-token.config';

export type RevocationReason =
  | 'rotated'
  | 'logout'
  | 'logout_all'
  | 'expired'
  | 'reuse_detected'
  | 'admin_revoked';

export interface RotationContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface RotatedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
  /** How often this family has been rotated, for client telemetry. */
  rotationCount: number;
  /** True when the refresh came from a different device than the login. */
  deviceChanged: boolean;
}

export interface RotationOutcome {
  result: RotatedTokens;
  /** The token row that was just consumed. */
  consumed: RefreshToken;
  /** The row that replaced it. */
  issued: RefreshToken;
}

export interface ReuseDetectionEvent {
  userId: string;
  familyId: string | null;
  reusedTokenId: string;
  revokedSessionsCount: number;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Stable, non-reversible device fingerprint.
 *
 * Built from the user agent plus the client IP prefix, so a mobile client that
 * changes address between requests is not reported as a new device while a
 * genuinely different client is.
 */
export function deviceFingerprint(ipAddress?: string | null, userAgent?: string | null): string {
  const parts = [
    (userAgent ?? 'unknown').trim().slice(0, 200),
    (ipAddress ?? 'unknown').trim().split('.').slice(0, 3).join('.'),
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

/**
 * #1316: refresh token issuance, rotation and reuse detection.
 *
 * Rotation rules implemented here:
 *  - every successful refresh issues a **new** refresh token and revokes the one
 *    that was presented, so a captured token is usable at most once;
 *  - tokens descending from one login share a `familyId`;
 *  - presenting a token that was already rotated is treated as a compromise:
 *    the whole family *and* every other session of that user are revoked,
 *    `tokenVersion` is bumped (killing all outstanding access tokens) and the
 *    detection is reported to `onReuseDetected`.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  /**
   * Security hook, assigned by AuthService so reuse can be reported through the
   * audit log and notifications without this service depending on them.
   */
  onReuseDetected?: (event: ReuseDetectionEvent) => Promise<void> | void;

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly accessTokenService: AccessTokenService,
  ) {}

  /**
   * Creates the first refresh token of a new family, right after a successful
   * login.
   */
  async issueForLogin(
    user: User,
    context: RotationContext,
    familyId: string = crypto.randomUUID(),
  ): Promise<{ row: RefreshToken; token: string; refreshExpiresIn: number }> {
    const config = getAuthTokenConfig();
    const issued = this.accessTokenService.issueRefreshToken(user, config);

    const row = await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        token: issued.token,
        jti: issued.claims.jti,
        familyId,
        userId: user.id,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        deviceInfo: deviceFingerprint(context.ipAddress, context.userAgent),
        isRevoked: false,
        expiresAt: issued.expiresAt,
        usedAt: null,
        replacedById: null,
        revocationReason: null,
      }),
    );

    return { row, token: issued.token, refreshExpiresIn: issued.expiresIn };
  }

  /**
   * #1316: exchanges a refresh token for a fresh pair, rotating the old token.
   *
   * @returns `null` when the token is unknown, already used or expired; the
   * caller turns that into a 401 without disclosing which case it was.
   */
  async rotate(
    presentedToken: string,
    context: RotationContext,
  ): Promise<RotationOutcome | null> {
    const config: AuthTokenConfig = getAuthTokenConfig();

    const claims = this.accessTokenService.verify<RefreshTokenClaims>(
      presentedToken,
      'refresh',
      config,
    );
    if (!claims) {
      this.logger.warn('Refresh rejected: signature, issuer, audience or token type mismatch');
      return null;
    }

    // Looked up *without* filtering on isRevoked: an already rotated token has
    // to be recognisable, that is what makes reuse detectable.
    const stored = await this.refreshTokenRepository.findOne({
      where: { token: presentedToken },
      relations: { user: true },
    });

    if (!stored) {
      this.logger.warn(`Refresh rejected: no stored token for jti ${claims.jti}`);
      return null;
    }

    if (stored.isRevoked) {
      await this.handleReuse(stored, context);
      return null;
    }

    if (!stored.expiresAt || new Date(stored.expiresAt).getTime() <= Date.now()) {
      await this.revoke(stored, 'expired');
      this.logger.warn(`Refresh rejected: token of user ${stored.userId} expired`);
      return null;
    }

    const user = stored.user;
    if (!user) {
      this.logger.warn(`Refresh rejected: user ${stored.userId} no longer exists`);
      return null;
    }

    const fingerprint = deviceFingerprint(context.ipAddress, context.userAgent);
    const deviceChanged = Boolean(stored.deviceInfo) && stored.deviceInfo !== fingerprint;

    if (deviceChanged) {
      this.logger.warn(
        `Refresh of user ${user.id} came from a different device than the one that created the session`,
      );
    }

    const access = this.accessTokenService.issueAccessToken(user, config);
    const refresh = this.accessTokenService.issueRefreshToken(user, config);

    const issued = await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        token: refresh.token,
        jti: refresh.claims.jti,
        familyId: stored.familyId,
        userId: user.id,
        ipAddress: context.ipAddress ?? stored.ipAddress ?? null,
        userAgent: context.userAgent ?? stored.userAgent ?? null,
        deviceInfo: fingerprint,
        isRevoked: false,
        expiresAt: refresh.expiresAt,
        usedAt: null,
        replacedById: null,
        revocationReason: null,
      }),
    );

    stored.isRevoked = true;
    stored.usedAt = new Date();
    stored.revocationReason = 'rotated';
    stored.replacedById = issued.id;
    await this.refreshTokenRepository.save(stored);

    return {
      result: {
        accessToken: access.token,
        refreshToken: refresh.token,
        tokenType: 'Bearer',
        expiresIn: access.expiresIn,
        refreshExpiresIn: refresh.expiresIn,
        rotationCount: await this.countFamilyUsage(stored.familyId),
        deviceChanged,
      },
      consumed: stored,
      issued,
    };
  }

  /** Revokes a single token with a reason; an already revoked row is untouched. */
  async revoke(stored: RefreshToken, reason: RevocationReason): Promise<void> {
    if (stored.isRevoked) {
      return;
    }
    stored.isRevoked = true;
    stored.revocationReason = reason;
    await this.refreshTokenRepository.save(stored);
  }

  /** Revokes every active session of a user (logout, password change, ...). */
  async revokeAllForUser(userId: string, reason: RevocationReason = 'logout_all'): Promise<number> {
    const active = await this.refreshTokenRepository.find({
      where: { userId, isRevoked: false },
    });

    if (active.length === 0) {
      return 0;
    }

    const result = await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true, revocationReason: reason },
    );

    return result.affected ?? active.length;
  }

  /** Purges tokens that expired more than `graceDays` ago. */
  async purgeExpired(graceDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);
    const result = await this.refreshTokenRepository.delete({ expiresAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }

  /**
   * #1316: concurrent refresh detection.
   *
   * A rotated token should never be presented again. If it is, assume it leaked:
   * revoke the family, revoke every other session of the user, bump
   * `tokenVersion` and report the event.
   */
  private async handleReuse(stored: RefreshToken, context: RotationContext): Promise<void> {
    this.logger.error(
      `Refresh token reuse detected for user ${stored.userId} (family ${stored.familyId}); revoking every session`,
    );

    if (stored.familyId) {
      await this.refreshTokenRepository.update(
        { familyId: stored.familyId, isRevoked: false },
        { isRevoked: true, revocationReason: 'reuse_detected' },
      );
    }

    const remaining = await this.refreshTokenRepository.find({
      where: { userId: stored.userId, isRevoked: false },
    });

    if (remaining.length > 0) {
      await this.refreshTokenRepository.update(
        { userId: stored.userId, isRevoked: false },
        { isRevoked: true, revocationReason: 'reuse_detected' },
      );
    }

    // Moving the version on invalidates every access token already in the wild.
    await this.bumpTokenVersion(stored.userId);

    await this.onReuseDetected?.({
      userId: stored.userId,
      familyId: stored.familyId,
      reusedTokenId: stored.id,
      revokedSessionsCount: remaining.length,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /** How many times this family has been rotated, including this exchange. */
  private async countFamilyUsage(familyId: string | null): Promise<number> {
    if (!familyId) {
      return 1;
    }
    const rotated = await this.refreshTokenRepository.count({
      where: { familyId, replacedById: Not(IsNull()) },
    });
    return rotated + 1;
  }

  /** Invalidates outstanding access tokens by moving the user's version on. */
  private async bumpTokenVersion(userId: string): Promise<void> {
    const repository = this.refreshTokenRepository.manager.getRepository(User);
    const user = await repository.findOne({ where: { id: userId } });

    if (!user) {
      return;
    }

    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await repository.save(user);
  }
}
