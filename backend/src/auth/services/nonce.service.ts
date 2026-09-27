import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from './redis.service';
import { WalletStrategy } from '../strategies/wallet.strategy';
import { getAuthTokenConfig } from '../config/auth-token.config';

export interface IssuedNonce {
  walletAddress: string;
  nonce: string;
  expiresAt: Date;
}

export interface StoredNonce {
  nonce: string;
  /** Purpose binding: a nonce issued for login may not be replayed elsewhere. */
  purpose: string;
  issuedAt: string;
  expiresAt: string;
}

export type ConsumeResult =
  | { status: 'ok'; nonce: StoredNonce }
  | { status: 'missing' }
  | { status: 'expired' }
  | { status: 'corrupted' };

/**
 * #1313: wallet challenge (nonce) lifecycle.
 *
 * - 256 bits of entropy from `crypto.randomBytes` (#1313 requires >= 128).
 * - Stored in Redis under `nonce:{walletAddress}` with a 5 minute TTL, so the
 *   entry disappears on its own.
 * - Issuing a nonce for a wallet overwrites any previous unused one, which
 *   leaves at most one live challenge per wallet.
 * - `consume()` reads *and* deletes in a single round trip. Doing the GET and
 *   the DEL separately leaves a window in which two parallel requests can both
 *   read the same nonce and both pass verification, which is exactly the replay
 *   the challenge exists to prevent.
 */
@Injectable()
export class NonceService {
  private readonly logger = new Logger(NonceService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly walletStrategy: WalletStrategy,
  ) {}

  static readonly PURPOSE_LOGIN = 'stellar_wallet_login';

  get ttlSeconds(): number {
    return getAuthTokenConfig().nonceTtlSeconds;
  }

  /** Redis key for a wallet challenge (#1313 requires this exact pattern). */
  static keyFor(walletAddress: string): string {
    return `nonce:${walletAddress.trim().toLowerCase()}`;
  }

  /**
   * Issues a fresh challenge for `walletAddress`, invalidating any previous
   * unused nonce for the same wallet.
   */
  async issue(walletAddress: string, purpose = NonceService.PURPOSE_LOGIN): Promise<IssuedNonce> {
    if (!this.walletStrategy.isValidAddress(walletAddress)) {
      throw new BadRequestException(
        'Valid Stellar wallet address (56-character G-address) is required',
      );
    }

    const normalized = walletAddress.trim().toLowerCase();
    const nonce = crypto.randomBytes(32).toString('hex'); // 256 bits
    const ttlSeconds = this.ttlSeconds;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const stored: StoredNonce = {
      nonce,
      purpose,
      issuedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // SET overwrites: the previous challenge for this wallet is gone.
    await this.redisService.set(NonceService.keyFor(normalized), JSON.stringify(stored), ttlSeconds);

    this.logger.debug(`Issued wallet challenge for ${normalized}, valid for ${ttlSeconds}s`);

    return { walletAddress: normalized, nonce, expiresAt };
  }

  /**
   * Atomically takes the challenge for a wallet: the value is removed whatever
   * the outcome, so a single nonce can back exactly one verification attempt.
   */
  async consume(walletAddress: string): Promise<ConsumeResult> {
    const key = NonceService.keyFor(walletAddress);
    const raw = await this.readAndDelete(key);

    if (raw === null) {
      return { status: 'missing' };
    }

    let parsed: StoredNonce;
    try {
      parsed = JSON.parse(raw) as StoredNonce;
    } catch {
      return { status: 'corrupted' };
    }

    if (!parsed?.nonce || Number.isNaN(new Date(parsed.expiresAt).getTime())) {
      return { status: 'corrupted' };
    }

    // The Redis TTL is the primary expiry; the embedded timestamp is a second,
    // independent check so a clock or TTL disagreement cannot extend a nonce.
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      return { status: 'expired' };
    }

    return { status: 'ok', nonce: parsed };
  }

  /** Drops a challenge without reading it (used when issuance is aborted). */
  async revoke(walletAddress: string): Promise<void> {
    await this.redisService.del(NonceService.keyFor(walletAddress));
  }

  /**
   * Constant-time comparison of a client supplied nonce against the issued one.
   * A plain `!==` leaks the matching prefix length through timing, which turns a
   * replay attempt into an oracle.
   */
  static matches(expected: string, provided: string | undefined | null): boolean {
    if (!provided || typeof provided !== 'string') {
      return false;
    }

    const expectedBytes = Buffer.from(expected, 'utf8');
    const providedBytes = Buffer.from(provided, 'utf8');

    if (expectedBytes.length !== providedBytes.length) {
      // Still burn a comparison so the fast path is not measurably faster.
      crypto.timingSafeEqual(expectedBytes, expectedBytes);
      return false;
    }

    return crypto.timingSafeEqual(expectedBytes, providedBytes);
  }

  /**
   * Reads and deletes in one call. `RedisService.getdel` uses the Redis `GETDEL`
   * command where available and keeps an in-memory fallback for development.
   */
  private async readAndDelete(key: string): Promise<string | null> {
    return this.redisService.getdel(key);
  }
}
