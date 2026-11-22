import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { buildKey, DEFAULT_KEY_PREFIX, RedisNamespace } from './redis.config';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_KEY_PREFIX = 'REDIS_KEY_PREFIX';

/** Thin injectable wrapper over the shared Redis connection with namespaced keys. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_KEY_PREFIX) private readonly prefix: string = DEFAULT_KEY_PREFIX,
  ) {}

  key(namespace: RedisNamespace, key: string): string {
    return buildKey(this.prefix, namespace, key);
  }

  async get(namespace: RedisNamespace, key: string): Promise<string | null> {
    return this.client.get(this.key(namespace, key));
  }

  /** Stores a value; with `ttlSeconds` it expires on its own. */
  async set(
    namespace: RedisNamespace,
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<void> {
    const fullKey = this.key(namespace, key);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(fullKey, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(fullKey, value);
    }
  }

  /** Atomically increments a counter and sets its expiry on the first increment. */
  async incrementWithExpiry(
    namespace: RedisNamespace,
    key: string,
    ttlSeconds: number,
  ): Promise<number> {
    const result = await this.client.eval(
      "local count = redis.call('INCR', KEYS[1]); " +
        "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; " +
        'return count',
      1,
      this.key(namespace, key),
      ttlSeconds,
    );
    return Number(result);
  }

  /** Returns how many keys were removed (0 or 1). */
  async del(namespace: RedisNamespace, key: string): Promise<number> {
    return this.client.del(this.key(namespace, key));
  }

  /** Returns true when the key exists and the expiry was set. */
  async expire(namespace: RedisNamespace, key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.expire(this.key(namespace, key), ttlSeconds)) === 1;
  }

  async exists(namespace: RedisNamespace, key: string): Promise<boolean> {
    return (await this.client.exists(this.key(namespace, key))) === 1;
  }

  /** Round-trip check used by the health endpoint; resolves with the latency in ms. */
  async ping(): Promise<number> {
    const started = Date.now();
    const reply = await this.client.ping();
    if (reply !== 'PONG') {
      throw new Error(`Unexpected reply to PING: ${String(reply)}`);
    }
    return Date.now() - started;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.ping();
      return true;
    } catch (error) {
      this.logger.warn(`Redis health check failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
