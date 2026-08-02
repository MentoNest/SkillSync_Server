import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../config/redis.module.js';
import { AuthService } from '../auth.service.js';

/**
 * #984: Service for revoking all sessions of a user.
 *
 * Invalidates all refresh tokens and increments token version
 * to invalidate existing access tokens.
 */

export interface RevokeAllResult {
  revokedCount: number;
  walletAddress: string;
  timestamp: number;
}

@Injectable()
export class SessionRevokeService {
  private readonly logger = new Logger(SessionRevokeService.name);
  private tokenVersions = new Map<string, number>();

  constructor(
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Revoke all sessions for a user.
   * Called by the user themselves or by an admin.
   */
  async revokeAllSessions(
    walletAddress: string,
    revokedBy: string,
  ): Promise<RevokeAllResult> {
    // Increment token version — invalidates all existing JWTs
    const currentVersion = this.tokenVersions.get(walletAddress) || 0;
    const newVersion = currentVersion + 1;
    this.tokenVersions.set(walletAddress, newVersion);

    // Clear all refresh tokens from Redis
    const refreshTokenPattern = `refresh:${walletAddress}:*`;
    await this.redisService.del(refreshTokenPattern);

    // Clear failed login counters
    await this.redisService.del(`failed_login:${walletAddress}`);

    const result: RevokeAllResult = {
      revokedCount: newVersion, // Use version as proxy for count
      walletAddress,
      timestamp: Date.now(),
    };

    this.logger.log(
      `All sessions revoked for ${walletAddress.slice(0, 8)}... by ${revokedBy.slice(0, 8)}... (version: ${newVersion})`,
    );

    return result;
  }

  /**
   * Get the current token version for a wallet.
   * Used to verify if a token was issued before the revocation.
   */
  getTokenVersion(walletAddress: string): number {
    return this.tokenVersions.get(walletAddress) || 0;
  }

  /**
   * Check if a token's version matches the current version.
   */
  isTokenValid(walletAddress: string, tokenVersion: number): boolean {
    const currentVersion = this.tokenVersions.get(walletAddress) || 0;
    return tokenVersion >= currentVersion;
  }
}
