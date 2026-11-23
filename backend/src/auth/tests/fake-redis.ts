import { RedisNamespace } from '../../redis/redis.config';

interface Entry {
  value: string;
  expiresAt?: number;
}

/** In-memory stand-in for RedisService with a controllable clock for TTL tests. */
export class FakeRedisService {
  readonly store = new Map<string, string>();
  private readonly counters = new Map<string, number>();
  private k = (ns: RedisNamespace, key: string) => `${ns}:${key}`;
  async get(ns: RedisNamespace, key: string) { return this.store.get(this.k(ns, key)) ?? null; }
  async set(ns: RedisNamespace, key: string, value: string) { this.store.set(this.k(ns, key), value); }
  async incrementWithExpiry(ns: RedisNamespace, key: string) {
    const counterKey = this.k(ns, key);
    const count = (this.counters.get(counterKey) ?? 0) + 1;
    this.counters.set(counterKey, count);
    return count;
  }
  async del(ns: RedisNamespace, key: string) { return this.store.delete(this.k(ns, key)) ? 1 : 0; }
  async exists(ns: RedisNamespace, key: string) { return this.store.has(this.k(ns, key)); }
}
