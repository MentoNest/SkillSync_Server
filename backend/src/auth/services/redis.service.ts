import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private inMemoryStore: Map<string, { value: string; expiresAt: number | null }> = new Map();
  private isConnected = false;

  constructor() {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPassword = process.env.REDIS_PASSWORD || undefined;

    try {
      this.client = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // disable retry spam if Redis is offline
      });

      this.client.connect().then(() => {
        this.isConnected = true;
        this.logger.log('Connected to Redis successfully');
      }).catch((err) => {
        this.logger.warn(`Redis connection failed (${err.message}). Using in-memory fallback storage.`);
        this.isConnected = false;
      });
    } catch (e: any) {
      this.logger.warn(`Redis init error (${e.message}). Using in-memory fallback.`);
      this.isConnected = false;
    }
  }

  async incr(key: string): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.incr(key);
      } catch (err) {
        this.logger.warn(`Redis error in incr, falling back to memory: ${err}`);
      }
    }

    const item = this.inMemoryStore.get(key);
    const now = Date.now();
    if (item && item.expiresAt && item.expiresAt < now) {
      this.inMemoryStore.delete(key);
    }

    const currentVal = this.inMemoryStore.has(key)
      ? parseInt(this.inMemoryStore.get(key)!.value, 10) || 0
      : 0;
    const newVal = currentVal + 1;
    const existingExpiry = this.inMemoryStore.get(key)?.expiresAt ?? null;
    this.inMemoryStore.set(key, { value: newVal.toString(), expiresAt: existingExpiry });
    return newVal;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (this.isConnected && this.client) {
      try {
        const res = await this.client.expire(key, seconds);
        return res === 1;
      } catch (err) {
        this.logger.warn(`Redis error in expire, falling back to memory: ${err}`);
      }
    }

    const item = this.inMemoryStore.get(key);
    if (item) {
      item.expiresAt = Date.now() + seconds * 1000;
      this.inMemoryStore.set(key, item);
      return true;
    }
    return false;
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch (err) {
        this.logger.warn(`Redis error in get, falling back to memory: ${err}`);
      }
    }

    const item = this.inMemoryStore.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.inMemoryStore.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch (err) {
        this.logger.warn(`Redis error in set, falling back to memory: ${err}`);
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.inMemoryStore.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch (err) {
        this.logger.warn(`Redis error in del: ${err}`);
      }
    }
    this.inMemoryStore.delete(key);
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        // ignore
      }
    }
  }
}
