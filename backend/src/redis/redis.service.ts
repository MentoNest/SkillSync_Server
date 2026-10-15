import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { getRedisConfig, RedisConfig } from './redis.config.js';

/**
 * Injectable Redis service (#1422).
 *
 * One shared connection backs response caching, session storage, rate-limit
 * counters, token blacklisting, and future Bull/BullMQ queues.
 *
 * Reliability:
 *  - `connectTimeout` from config (default 10s).
 *  - Exponential-backoff `retryStrategy` (500ms × attempt, capped at 10s) so
 *    the client keeps retrying instead of giving up on a restart.
 *  - `reconnectOnError: () => true` treats every error as recoverable.
 *  - Every key is namespaced by `keyPrefix` to avoid collisions between
 *    concerns sharing the instance.
 *  - `isHealthy()` backs the HTTP health endpoint.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly config: RedisConfig;
  private readonly client: Redis;

  constructor() {
    this.config = getRedisConfig();

    this.client = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      connectTimeout: this.config.connectTimeoutMs,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      // Exponential backoff between reconnection attempts, capped at 10s.
      retryStrategy: (attempt: number) => Math.min(attempt * 500, 10000),
      reconnectOnError: () => true,
    });

    this.client.on('ready', () => this.logger.log('Redis connection ready'));
    this.client.on('error', (err: Error) =>
      this.logger.warn(`Redis connection error: ${err.message}`),
    );
    this.client.on('reconnecting', (delay: number) =>
      this.logger.warn(`Redis reconnecting in ${delay}ms`),
    );
    this.client.on('close', () => this.logger.warn('Redis connection closed'));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.log(
        `Connected to Redis at ${this.config.host}:${this.config.port} ` +
          `(db ${this.config.db}, prefix "${this.config.keyPrefix}")`,
      );
    } catch (err) {
      // Redis being briefly unavailable must not crash startup — the
      // retryStrategy above keeps attempting to reconnect in the background.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Initial Redis connection failed, retrying in the background: ${message}`,
      );
    }
  }

  /** Underlying ioredis client, for pipelines, pub/sub or Bull queues. */
  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<'OK'> {
    if (ttlSeconds) {
      return this.client.set(key, value, 'EX', ttlSeconds);
    }
    return this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /** Atomic counter, for rate limiting and similar rolling tallies. */
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  /** Connectivity check for the health endpoint: PONG → healthy. */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
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
