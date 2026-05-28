import {
  BadRequestException,
  Injectable,
  TooManyRequestsException,
} from '@nestjs/common';

import { randomBytes } from 'crypto';

import Redis from 'ioredis';

import {
  NONCE_KEY_PREFIX,
  NONCE_RATE_LIMIT,
  NONCE_TTL_SECONDS,
} from '../constants/auth.constants';

import { isValidStellarAddress } from '../validators/stellar-wallet.validator';

@Injectable()
export class NonceProvider {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
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
      throw new TooManyRequestsException(
        'Too many nonce requests',
      );
    }
  }
}