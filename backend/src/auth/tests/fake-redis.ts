import { RedisNamespace } from '../../redis/redis.config';

interface Counter {
  count: number;
  expiresAt?: number;
}

/** In-memory stand-in for RedisService with a controllable clock for TTL tests. */
export class FakeRedisService {
  readonly store = new Map<string, string>();
  private readonly expiries = new Map<string, number>();
  private readonly counters = new Map<string, Counter>();
  private now = Date.now();
  private k = (ns: RedisNamespace, key: string) => `${ns}:${key}`;

  advance(ms: number) { this.now += ms; }
  reset() {
    this.store.clear();
    this.expiries.clear();
    this.counters.clear();
    this.now = Date.now();
  }

  async get(ns: RedisNamespace, key: string) {
    const fullKey = this.k(ns, key);
    const value = this.store.get(fullKey);
    const expiresAt = this.expiries.get(fullKey);
    if (value === undefined) return null;
    if (expiresAt !== undefined && this.now >= expiresAt) {
      this.store.delete(fullKey);
      this.expiries.delete(fullKey);
      return null;
    }
    return value;
  }

  async set(ns: RedisNamespace, key: string, value: string, ttlSeconds?: number) {
    const fullKey = this.k(ns, key);
    this.store.set(fullKey, value);
    if (ttlSeconds) this.expiries.set(fullKey, this.now + ttlSeconds * 1000);
    else this.expiries.delete(fullKey);
  }

  async incrementWithExpiry(ns: RedisNamespace, key: string, windowSeconds?: number) {
    const counterKey = this.k(ns, key);
    const existing = this.counters.get(counterKey);
    const count =
      existing && (existing.expiresAt === undefined || this.now < existing.expiresAt)
        ? existing.count + 1
        : 1;
    this.counters.set(counterKey, {
      count,
      expiresAt: windowSeconds ? this.now + windowSeconds * 1000 : undefined,
    });
    return count;
  }

  async del(ns: RedisNamespace, key: string) {
    const fullKey = this.k(ns, key);
    this.expiries.delete(fullKey);
    return this.store.delete(fullKey) ? 1 : 0;
  }
  async exists(ns: RedisNamespace, key: string) { return (await this.get(ns, key)) !== null; }
}
