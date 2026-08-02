import { Injectable } from '@nestjs/common';
import { RedisService } from '../../config/redis.module.js';

/**
 * #976: Redis-backed access token blacklist.
 *
 * Persists revoked jti's beyond process memory so logout invalidation
 * survives restarts and works across multiple server instances.
 */
@Injectable()
export class TokenBlacklistService {
  constructor(private readonly redisService: RedisService) {}

  async blacklist(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti || ttlSeconds <= 0) return;
    await this.redisService.set(`blacklist:${jti}`, '1', ttlSeconds);
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    if (!jti) return false;
    return this.redisService.exists(`blacklist:${jti}`);
  }
}
