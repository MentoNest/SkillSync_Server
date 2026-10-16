import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

export const NONCE_TTL_SECONDS = 300;
const key = (wallet: string) => `auth:nonce:${wallet}`;

/** Builds the exact text a wallet must sign. */
export function buildLoginMessage(walletAddress: string, nonce: string): string {
  return `SkillSync login\nWallet: ${walletAddress}\nNonce: ${nonce}`;
}

@Injectable()
export class NonceService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async issue(walletAddress: string): Promise<{ nonce: string; message: string; expiresAt: string }> {
    const wallet = walletAddress.toUpperCase();
    const nonce = randomBytes(32).toString('hex');
    await this.redis.set(key(wallet), nonce, 'EX', NONCE_TTL_SECONDS);
    return {
      nonce,
      message: buildLoginMessage(wallet, nonce),
      expiresAt: new Date(Date.now() + NONCE_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** Atomically fetch-and-delete so a nonce can be used exactly once. */
  async consume(walletAddress: string, nonce: string): Promise<void> {
    const stored = await this.redis.getdel(key(walletAddress.toUpperCase()));
    if (!stored || stored !== nonce) {
      throw new UnauthorizedException('Invalid or expired nonce');
    }
  }
}
