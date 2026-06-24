import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  async onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: () => true,
    });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  getClient(): Redis {
    return this.client;
  }

  private getKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  async set(key: string, value: string, expire?: number, prefix?: string): Promise<void> {
    const finalKey = this.getKey(key, prefix);
    if (expire) {
      await this.client.set(finalKey, value, 'EX', expire);
    } else {
      await this.client.set(finalKey, value);
    }
  }

  async get(key: string, prefix?: string): Promise<string | null> {
    const finalKey = this.getKey(key, prefix);
    return this.client.get(finalKey);
  }

  async del(key: string, prefix?: string): Promise<void> {
    const finalKey = this.getKey(key, prefix);
    await this.client.del(finalKey);
  }

  async expire(key: string, seconds: number, prefix?: string): Promise<void> {
    const finalKey = this.getKey(key, prefix);
    await this.client.expire(finalKey, seconds);
  }
}