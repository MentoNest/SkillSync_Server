import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../user/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { TokenBlacklistService } from '../security/token-blacklist.service';
import { LogoutAllResponseDto, LogoutResponseDto } from './dto/logout.dto';

export interface LogoutContext {
  userId: string;
  /** Raw access token from the `Authorization` header, if any. */
  accessToken?: string | null;
  refreshToken?: string;
  ipAddress?: string;
  userAgent?: string;
  walletAddress?: string | null;
}

/**
 * #1317: logout and token invalidation.
 *
 * A stateless access token cannot be deleted, so logout performs two actions:
 *  1. the presented access token is added to the Redis blacklist with a TTL
 *     equal to its remaining lifetime, and
 *  2. the matching refresh token row is removed from the database, so no new
 *     access token can be minted from that session.
 *
 * `logoutAll` additionally bumps `tokenVersion`, which invalidates every access
 * token ever issued to the user (the JWT guard compares the claim against the
 * column) without having to enumerate them.
 */
@Injectable()
export class LogoutService {
  private readonly logger = new Logger(LogoutService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly auditService: AuditService,
  ) {}

  async logout(context: LogoutContext): Promise<LogoutResponseDto> {
    const blacklistedForSeconds = await this.tokenBlacklist.blacklistToken(
      context.accessToken ?? null,
    );

    const refreshTokenRevoked = await this.revokeRefreshToken(
      context.userId,
      context.refreshToken,
    );

    await this.auditService.logLogout({
      userId: context.userId,
      walletAddress: context.walletAddress ?? null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      scope: 'session',
      blacklistedToken: blacklistedForSeconds !== null,
      refreshTokenRevoked,
    });

    return {
      success: true,
      message: 'Logged out successfully',
      blacklistedForSeconds,
      refreshTokenRevoked,
    };
  }

  /**
   * #1317: terminate every session of the user — on every device. Access
   * tokens die through the `tokenVersion` bump, refresh tokens are deleted.
   */
  async logoutAll(context: Omit<LogoutContext, 'accessToken' | 'refreshToken'>): Promise<LogoutAllResponseDto> {
    const existingTokens = await this.refreshTokenRepository.find({
      where: { userId: context.userId, isRevoked: false },
      select: ['id'],
    });
    const revokedSessionsCount = existingTokens.length;

    if (revokedSessionsCount > 0) {
      await this.refreshTokenRepository.delete({ userId: context.userId });
    }

    const tokenVersion = await this.bumpTokenVersion(context.userId);

    await this.auditService.logLogout({
      userId: context.userId,
      walletAddress: context.walletAddress ?? null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      scope: 'all',
      blacklistedToken: true,
      refreshTokenRevoked: revokedSessionsCount > 0,
      revokedSessionsCount,
      tokenVersion,
    });

    this.logger.log(
      `Revoked ${revokedSessionsCount} session(s) for user ${context.userId} (tokenVersion=${tokenVersion})`,
    );

    return {
      success: true,
      message: 'All sessions have been terminated',
      revokedSessionsCount,
      tokenVersion,
    };
  }

  /**
   * Deletes the supplied refresh token, but only when it belongs to the caller
   * — otherwise a user could revoke somebody else's session by guessing a
   * token value. Falls back to the user's most recent active session when no
   * token was supplied (the client may have dropped it already).
   */
  private async revokeRefreshToken(
    userId: string,
    refreshToken?: string,
  ): Promise<boolean> {
    if (refreshToken) {
      const result = await this.refreshTokenRepository.delete({
        token: refreshToken,
        userId,
      });

      if ((result.affected ?? 0) > 0) {
        return true;
      }

      this.logger.warn(
        `Logout requested with an unknown or foreign refresh token for user ${userId}`,
      );
      return false;
    }

    const latest = await this.refreshTokenRepository.findOne({
      where: { userId, isRevoked: false },
      order: { createdAt: 'DESC' },
    });

    if (!latest) {
      return false;
    }

    await this.refreshTokenRepository.delete({ id: latest.id });
    return true;
  }

  /**
   * Password-equivalent invalidation: the guard compares `tokenVersion` from the
   * JWT against the column, so bumping it invalidates every issued token.
   */
  private async bumpTokenVersion(userId: string): Promise<number> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const next = (user?.tokenVersion ?? 0) + 1;

    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ tokenVersion: next })
      .where('id = :id', { id: userId })
      .execute();

    if (user) {
      user.tokenVersion = next;
    }

    return next;
  }
}
