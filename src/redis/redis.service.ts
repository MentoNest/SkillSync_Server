import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { AppConfigService } from '../config/app-config.service';
import { createRedisConfig } from './redis.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: any;
  private keyPrefix: string;

  constructor(private configService: AppConfigService) {}

  async onModuleInit() {
    const config = await createRedisConfig(this.configService);
    this.keyPrefix = this.configService.get<string>('REDIS_KEY_PREFIX') || 'skillsync';
    
    this.client = createClient(config);

    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis client connected');
    });

    this.client.on('reconnecting', () => {
      this.logger.log('Redis client reconnecting...');
    });

    this.client.on('ready', () => {
      this.logger.log('Redis client ready');
    });

    await this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis client disconnected');
    } else {
      this.logger.log('Redis client was not initialized, skipping disconnect');
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  /**
   * Get prefixed key
   */
  private getPrefixedKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.get(prefixedKey);
  }

  /**
   * Get and parse JSON value by key
   */
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Failed to parse JSON for key ${key}`, error);
      return null;
    }
  }

  /**
   * Set value with optional TTL (in seconds)
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    const prefixedKey = this.getPrefixedKey(key);
    
    if (ttl) {
      await this.client.setEx(prefixedKey, ttl, value);
    } else {
      await this.client.set(prefixedKey, value);
    }
  }

  /**
   * Set JSON value with optional TTL (in seconds)
   */
  async setJson(key: string, value: any, ttl?: number): Promise<void> {
    const jsonString = JSON.stringify(value);
    await this.set(key, jsonString, ttl);
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return this.client.del(prefixedKey);
  }

  /**
   * Set expiration time (in seconds)
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const prefixedKey = this.getPrefixedKey(key);
    const result = await this.client.expire(prefixedKey, seconds);
    return result === 1;
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const prefixedKey = this.getPrefixedKey(key);
    const result = await this.client.exists(prefixedKey);
    return result === 1;
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    const prefixedPattern = this.getPrefixedKey(pattern);
    return this.client.keys(prefixedPattern);
  }

  /**
   * Increment value
   */
  async incr(key: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return this.client.incr(prefixedKey);
  }

  /**
   * Decrement value
   */
  async decr(key: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return this.client.decr(prefixedKey);
  }

  /**
   * Health check - ping Redis
   */
  async ping(): Promise<{ status: string; responseTime: string }> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.ping();
      const responseTime = Date.now() - startTime;
      
      return {
        status: response === 'PONG' ? 'healthy' : 'unhealthy',
        responseTime: `${responseTime}ms`,
      };
    } catch (error) {
      this.logger.error('Redis ping failed', error);
      return {
        status: 'unhealthy',
        responseTime: `${Date.now() - startTime}ms`,
      };
    }
  }
}
