import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

export interface NoncePayload {
  nonce: string;
  expiresAt: number;
  ttl: number;
}

interface NonceEntry {
  nonce: string;
  expiresAtMs: number;
}

const TTL_SECONDS = 300;

@Injectable()
export class StellarNonceService {
  private readonly store = new Map<string, NonceEntry>();

  issue(publicKey: string): NoncePayload {
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;

    this.store.set(publicKey, { nonce, expiresAtMs: expiresAt * 1000 });

    return { nonce, expiresAt, ttl: TTL_SECONDS };
  }

  /** One-time use — deleted on first check regardless of outcome */
  consume(publicKey: string, nonce: string): boolean {
    const entry = this.store.get(publicKey);
    this.store.delete(publicKey);

    if (!entry) return false;
    if (Date.now() > entry.expiresAtMs) return false;
    return entry.nonce === nonce;
  }
}