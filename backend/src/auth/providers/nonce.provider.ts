import {
  BadRequestException,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { randomBytes } from 'crypto';

import Redis from 'ioredis';

import {
  NONCE_KEY_PREFIX,
  NONCE_RATE_LIMIT,
  NONCE_TTL_SECONDS,
  LOGIN_RATE_LIMIT,
  LOGIN_RATE_KEY_PREFIX,
} from '../constants/auth.constants';

import { isValidStellarAddress } from '../validators/stellar-wallet.validator';

@Injectable()
export class NonceProvider {
  private readonly redis: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }
    this.redis = new Redis(redisUrl);
  }

  async generate(walletAddress: string) {
    if (!isValidStellarAddress(walletAddress)) {
      throw new BadRequestException(
        'Invalid Stellar wallet address',
      );
    }

    await this.enforceRateLimit(walletAddress);

    const nonce = randomBytes(32).toString('hex');

    const key = `${NONCE_KEY_PREFIX}${walletAddress}`;

    /**
     * Invalidate previous nonce automatically
     * by overwriting the existing key.
     */

    await this.redis.set(
      key,
      nonce,
      'EX',
      NONCE_TTL_SECONDS,
    );

    const expiresAt = new Date(
      Date.now() + NONCE_TTL_SECONDS * 1000,
    ).toISOString();

    return {
      nonce,
      expiresAt,
    };
  }

  async verifyAndConsume(walletAddress: string, nonce: string): Promise<boolean> {
    const key = `${NONCE_KEY_PREFIX}${walletAddress}`;
    
    const storedNonce = await this.redis.get(key);
    
    if (!storedNonce) {
      return false;
    }
    
    if (storedNonce !== nonce) {
      return false;
    }
    
    await this.redis.del(key);
    
    return true;
  }

  async enforceLoginRateLimit(walletAddress: string): Promise<void> {
    const rateKey = `${LOGIN_RATE_KEY_PREFIX}${walletAddress}`;

    const current = await this.redis.incr(rateKey);

    if (current === 1) {
      await this.redis.expire(rateKey, LOGIN_RATE_LIMIT.ttl);
    }

    if (current > LOGIN_RATE_LIMIT.limit) {
      throw new HttpException(
        'Too many login attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async enforceRateLimit(
    walletAddress: string,
  ): Promise<void> {
    const rateKey = `nonce-rate:${walletAddress}`;

    const current =
      await this.redis.incr(rateKey);

    if (current === 1) {
      await this.redis.expire(
        rateKey,
        NONCE_RATE_LIMIT.ttl,
      );
    }

    if (current > NONCE_RATE_LIMIT.limit) {
      throw new HttpException(
        'Too many nonce requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}