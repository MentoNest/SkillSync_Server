import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

const key = (jti: string) => `auth:blacklist:${jti}`;

/** Access-token blacklist; entries expire with the token so Redis does not grow unbounded. */
@Injectable()
export class TokenBlacklistService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async blacklist(jti: string, expSeconds: number): Promise<void> {
    const ttl = expSeconds - Math.floor(Date.now() / 1000);
    if (ttl > 0) await this.redis.set(key(jti), '1', 'EX', ttl);
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    return (await this.redis.exists(key(jti))) === 1;
  }
}
