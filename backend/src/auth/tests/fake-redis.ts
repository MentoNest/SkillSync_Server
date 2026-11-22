import { RedisNamespace } from '../../redis/redis.config';

interface Entry {
  value: string;
  expiresAt?: number;
}

/** In-memory stand-in for RedisService with a controllable clock for TTL tests. */
export class FakeRedisService {
  readonly store = new Map<string, Entry>();
  private now = Date.now();
  private k = (ns: RedisNamespace, key: string) => `${ns}:${key}`;

  async get(ns: RedisNamespace, key: string): Promise<string | null> {
    const fullKey = this.k(ns, key);
    const entry = this.store.get(fullKey);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && this.now >= entry.expiresAt) {
      this.store.delete(fullKey);
      return null;
    }
    return entry.value;
  }

  async set(ns: RedisNamespace, key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(this.k(ns, key), {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? this.now + ttlSeconds * 1000 : undefined,
    });
  }

  async del(ns: RedisNamespace, key: string): Promise<number> {
    return this.store.delete(this.k(ns, key)) ? 1 : 0;
  }

  async exists(ns: RedisNamespace, key: string): Promise<boolean> {
    return (await this.get(ns, key)) !== null;
  }

  /** Moves the fake clock forward so expiry can be tested without sleeping. */
  advance(milliseconds: number): void {
    this.now += milliseconds;
  }

  reset(clock = Date.now()): void {
    this.store.clear();
    this.now = clock;
  }
}
