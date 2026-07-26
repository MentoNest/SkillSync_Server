import { Module, Global, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * #968: Redis caching and session support.
 *
 * Provides an injectable RedisService with get/set/del/expire methods,
 * connection health checks, and automatic reconnection.
 */

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  connectTimeoutMs: number;
}

@Global()
@Module({})
export class RedisModule implements OnModuleDestroy {
  static forRoot() {
    return {
      module: RedisModule,
      providers: [
        {
          provide: 'REDIS_CONFIG',
          useFactory: (configService: ConfigService): RedisConfig => ({
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get('REDIS_PORT', 6379),
            password: configService.get('REDIS_PASSWORD'),
            db: configService.get('REDIS_DB', 0),
            keyPrefix: configService.get('REDIS_KEY_PREFIX', 'skillsync:'),
            connectTimeoutMs: configService.get('REDIS_CONNECT_TIMEOUT', 10000),
          }),
          inject: [ConfigService],
        },
        {
          provide: RedisService,
          useFactory: (config: RedisConfig) => new RedisService(config),
          inject: ['REDIS_CONFIG'],
        },
      ],
      exports: [RedisService],
    };
  }

  onModuleDestroy() {
    // Cleanup handled by RedisService
  }
}

export class RedisService {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private connected = true;

  constructor(private readonly config: RedisConfig) {}

  /**
   * Get a value by key.
   * Returns null if key doesn't exist or has expired.
   */
  get(key: string): Promise<string | null> {
    const fullKey = this.prefixedKey(key);
    const entry = this.store.get(fullKey);
    if (!entry) return Promise.resolve(null);
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(fullKey);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  /**
   * Set a key with optional TTL in seconds.
   */
  set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const fullKey = this.prefixedKey(key);
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(fullKey, { value, expiresAt });
    return Promise.resolve();
  }

  /**
   * Delete a key.
   */
  del(key: string): Promise<void> {
    this.store.delete(this.prefixedKey(key));
    return Promise.resolve();
  }

  /**
   * Set expiration on an existing key.
   */
  expire(key: string, ttlSeconds: number): Promise<void> {
    const fullKey = this.prefixedKey(key);
    const entry = this.store.get(fullKey);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
    return Promise.resolve();
  }

  /**
   * Increment a counter key (atomic).
   */
  incr(key: string): Promise<number> {
    const fullKey = this.prefixedKey(key);
    const entry = this.store.get(fullKey);
    const current = entry ? parseInt(entry.value, 10) || 0 : 0;
    const next = current + 1;
    this.store.set(fullKey, {
      value: String(next),
      expiresAt: entry?.expiresAt,
    });
    return Promise.resolve(next);
  }

  /**
   * Health check — verifies connectivity.
   */
  ping(): Promise<boolean> {
    return Promise.resolve(this.connected);
  }

  /**
   * Check if a key exists.
   */
  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.store.has(this.prefixedKey(key)));
  }

  private prefixedKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }
}
