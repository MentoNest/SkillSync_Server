import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface ThrottleResult {
  allowed: boolean;
  retryAfter: number; // seconds until oldest request expires
}

@Injectable()
export class ThrottlerService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Sliding window rate limit using Redis sorted sets.
   * Key format: throttle:<identifier>
   */
  async check(identifier: string, limit: number, ttl: number): Promise<ThrottleResult> {
    const key = `throttle:${identifier}`;
    const now = Date.now();
    const windowStart = now - ttl * 1000;
    const client = this.redisService.getClient();

    // Atomic sliding window: remove expired entries, count, conditionally add
    const [, count] = await client
      .multi()
      .zremrangebyscore(key, '-inf', windowStart)
      .zcard(key)
      .exec() as [any, [null, number]];

    const currentCount = count[1];

    if (currentCount >= limit) {
      // Get the oldest entry's score to compute retry-after
      const oldest = await client.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTs = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
      const retryAfter = Math.ceil((oldestTs + ttl * 1000 - now) / 1000);
      return { allowed: false, retryAfter: Math.max(1, retryAfter) };
    }

    // Add current request with timestamp as score
    await client
      .multi()
      .zadd(key, now, `${now}-${Math.random()}`)
      .expire(key, ttl)
      .exec();

    return { allowed: true, retryAfter: 0 };
  }
}
