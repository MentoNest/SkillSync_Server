import { RedisNamespace } from '../../redis/redis.config';

/** In-memory stand-in for RedisService (ignores TTLs). */
export class FakeRedisService {
  readonly store = new Map<string, string>();
  private k = (ns: RedisNamespace, key: string) => `${ns}:${key}`;
  async get(ns: RedisNamespace, key: string) { return this.store.get(this.k(ns, key)) ?? null; }
  async set(ns: RedisNamespace, key: string, value: string) { this.store.set(this.k(ns, key), value); }
  async del(ns: RedisNamespace, key: string) { return this.store.delete(this.k(ns, key)) ? 1 : 0; }
  async exists(ns: RedisNamespace, key: string) { return this.store.has(this.k(ns, key)); }
}
