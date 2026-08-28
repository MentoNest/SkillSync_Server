import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConfig, RedisConfig } from './redis.config';

/**
 * Central, injectable Redis service (#1142).
 *
 * Backs response caching, session storage, rate limiting counters, token
 * blacklisting, and future Bull/BullMQ queues off of one shared, reusable
 * connection. Exposed via `RedisModule` so any feature module can inject it.
 *
 * Reliability characteristics:
 *  - Configurable connection timeout (`REDIS_CONNECT_TIMEOUT_MS`, default 10s).
 *  - Exponential-backoff reconnection strategy (capped at 10s between tries)
 *    so the client keeps retrying indefinitely instead of giving up.
 *  - Every key is namespaced with a configurable prefix (`REDIS_KEY_PREFIX`)
 *    to avoid collisions between concerns/services sharing the same Redis.
 *  - `isHealthy()` for wiring into HTTP health check endpoints.
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
      // Automatic reconnection with exponential backoff, capped at 10s.
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
        `Connected to Redis at ${this.config.host}:${this.config.port} (db ${this.config.db}, prefix "${this.config.keyPrefix}")`,
      );
    } catch (err) {
      // Don't crash app startup if Redis is briefly unavailable — the
      // retryStrategy above keeps attempting to reconnect in the background.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Initial Redis connection failed, will keep retrying in the background: ${message}`,
      );
    }
  }

  /** Underlying ioredis client, for advanced use (pipelines, pub/sub, Bull, ...). */
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

  /** Atomic counter, handy for rate limiting. */
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  /** Connectivity health check, suitable for use from HTTP health endpoints. */
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
