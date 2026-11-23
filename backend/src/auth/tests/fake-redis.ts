import { RedisNamespace } from '../../redis/redis.config';

/** In-memory stand-in for RedisService with a controllable clock for TTL tests. */
export class FakeRedisService {
  readonly store = new Map<string, string>();
  private readonly counters = new Map<string, number>();
  private readonly expirations = new Map<string, number>();
  private now = Date.now();
  private k = (ns: RedisNamespace, key: string) => `${ns}:${key}`;
  get(ns: RedisNamespace, key: string): Promise<string | null> {
    const storageKey = this.k(ns, key);
    if ((this.expirations.get(storageKey) ?? Infinity) <= this.now) {
      this.store.delete(storageKey);
      this.expirations.delete(storageKey);
    }
    return Promise.resolve(this.store.get(storageKey) ?? null);
  }
  set(ns: RedisNamespace, key: string, value: string, ttlSeconds?: number): Promise<void> {
    const storageKey = this.k(ns, key);
    this.store.set(storageKey, value);
    if (ttlSeconds && ttlSeconds > 0) this.expirations.set(storageKey, this.now + ttlSeconds * 1000);
    else this.expirations.delete(storageKey);
    return Promise.resolve();
  }
  incrementWithExpiry(ns: RedisNamespace, key: string, ttlSeconds = 3600): Promise<number> {
    const counterKey = this.k(ns, key);
    if ((this.expirations.get(counterKey) ?? Infinity) <= this.now) this.counters.delete(counterKey);
    const count = (this.counters.get(counterKey) ?? 0) + 1;
    this.counters.set(counterKey, count);
    this.store.set(counterKey, String(count));
    if (count === 1) this.expirations.set(counterKey, this.now + ttlSeconds * 1000);
    return Promise.resolve(count);
  }
  del(ns: RedisNamespace, key: string): Promise<number> {
    const storageKey = this.k(ns, key);
    this.expirations.delete(storageKey);
    return Promise.resolve(this.store.delete(storageKey) ? 1 : 0);
  }
  exists(ns: RedisNamespace, key: string): Promise<boolean> {
    return this.get(ns, key).then((value) => value !== null);
  }
  revokeRefreshTokensForUser(address: string): Promise<number> {
    let count = 0;
    for (const [key, value] of this.store) {
      if (key.startsWith(`${RedisNamespace.SESSION}:refresh:`) && value === address) {
        this.store.delete(key);
        this.expirations.delete(key);
        count++;
      }
    }
    return Promise.resolve(count);
  }
  reset() {
    this.store.clear();
    this.counters.clear();
    this.expirations.clear();
  }
  advance(milliseconds: number) { this.now += milliseconds; }
}
