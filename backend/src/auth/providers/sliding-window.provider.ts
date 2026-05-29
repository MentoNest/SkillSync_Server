import { Injectable } from '@nestjs/common';

import Redis from 'ioredis';

@Injectable()
export class SlidingWindowProvider {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  async check(
    key: string,
    limit: number,
    ttl: number,
  ) {
    const now = Date.now();

    const windowStart =
      now - ttl * 1000;

    const requestId =
      `${now}-${Math.random()}`;

    await this.redis.zremrangebyscore(
      key,
      0,
      windowStart,
    );

    await this.redis.zadd(
      key,
      now,
      requestId,
    );

    const count =
      await this.redis.zcard(key);

    await this.redis.expire(
      key,
      ttl,
    );

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfter:
        count > limit
          ? await this.getRetryAfter(
              key,
              ttl,
            )
          : 0,
    };
  }

  private async getRetryAfter(
    key: string,
    ttl: number,
  ): Promise<number> {
    const entries =
      await this.redis.zrange(
        key,
        0,
        0,
        'WITHSCORES',
      );

    if (!entries.length) {
      return ttl;
    }

    const oldestTimestamp =
      Number(entries[1]);

    const elapsed =
      Date.now() - oldestTimestamp;

    return Math.ceil(
      ttl - elapsed / 1000,
    );
  }
}