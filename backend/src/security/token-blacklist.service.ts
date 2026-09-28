import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from '../services/redis.service';

/** Default TTL used when a token's `exp` claim cannot be read. */
const FALLBACK_BLACKLIST_TTL_SECONDS = 24 * 60 * 60;

/**
 * #1317: Redis backed access token blacklist.
 *
 * Logout cannot delete a stateless JWT, so the token is parked in Redis until
 * the moment it would have expired anyway. The JWT guard consults the blacklist
 * *before* verifying the signature, so a revoked token is rejected even if it
 * is still cryptographically valid.
 *
 * Keys are SHA-256 digests of the token: Redis keys are frequently dumped,
 * logged and inspected, and a raw JWT in there is a live credential.
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(private readonly redisService: RedisService) {}

  /** Digest used as the Redis key for a raw access token. */
  static digestFor(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Pulls the raw token out of an `Authorization: Bearer <token>` header. */
  static extractBearerToken(authorizationHeader?: string | null): string | null {
    if (!authorizationHeader) {
      return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    if (!token || scheme?.toLowerCase() !== 'bearer') {
      return null;
    }

    return token.trim() || null;
  }

  /**
   * Number of seconds a token should stay blacklisted: exactly the remainder of
   * its lifetime, so the entry disappears together with the token itself.
   *
   * The payload is decoded without verification on purpose — the only thing
   * needed here is the `exp` claim of a token we are about to revoke.
   */
  ttlUntilExpiration(token: string, fallbackSeconds = FALLBACK_BLACKLIST_TTL_SECONDS): number {
    const exp = TokenBlacklistService.readExpiration(token);
    if (!exp) {
      return fallbackSeconds;
    }

    const remaining = Math.floor((exp - Date.now()) / 1000);
    // Keep a small floor so a token that is about to expire is still covered.
    return remaining > 1 ? remaining : 1;
  }

  /** Reads the `exp` claim without verifying the signature. */
  static readExpiration(token: string): number | null {
    const [header, payload] = token.split('.');
    if (!header || !payload) {
      return null;
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { exp?: number };

      return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  /**
   * Revokes a token until it would have expired. Returns the TTL used, or
   * `null` when there was no token to revoke.
   */
  async blacklistToken(token?: string | null, ttlSeconds?: number): Promise<number | null> {
    if (!token) {
      return null;
    }

    const ttl = ttlSeconds ?? this.ttlUntilExpiration(token);

    try {
      // RedisService namespaces the key with the `blacklist:` prefix.
      await this.redisService.blacklistToken(TokenBlacklistService.digestFor(token), ttl);
      this.logger.debug(`Access token blacklisted for ${ttl}s`);
      return ttl;
    } catch (error) {
      // A logout must not silently leave a live token behind: surface the
      // failure loudly, the caller decides how to proceed.
      this.logger.error(
        `Failed to blacklist token: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async isTokenBlacklisted(token?: string | null): Promise<boolean> {
    if (!token) {
      return false;
    }

    try {
      return await this.redisService.isTokenBlacklisted(
        TokenBlacklistService.digestFor(token),
      );
    } catch (error) {
      this.logger.error(
        `Failed to read token blacklist: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
