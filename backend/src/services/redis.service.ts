import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly memoryStore = new Map<string, number[]>(); // In-memory fallback for sliding window
  private readonly memoryBlacklist = new Map<string, number>(); // In-memory fallback for blacklist (token -> expiry timestamp)

  constructor() {
    this.initClient();
  }

  private initClient() {
    try {
      const host = process.env.REDIS_HOST || 'localhost';
      const port = Number(process.env.REDIS_PORT) || 6379;
      const password = process.env.REDIS_PASSWORD || undefined;

      this.client = new Redis({
        host,
        port,
        password,
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Do not retry continuously in tests/disconnected envs
      });

      this.client.on('error', (err) => {
        this.logger.warn(`Redis connection error, falling back to in-memory store: ${err.message}`);
      });

      this.client.connect().catch((err) => {
        this.logger.warn(`Could not connect to Redis, using in-memory store: ${err.message}`);
      });
    } catch (e: any) {
      this.logger.warn(`Redis init error: ${e.message}`);
      this.client = null;
    }
  }

  getClient(): Redis | null {
    return this.client?.status === 'ready' ? this.client : null;
  }

  /**
   * Sliding window rate limiting implementation
   */
  async checkRateLimit(
    key: string,
    limit: number,
    ttlSeconds: number,
  ): Promise<{ isLimited: boolean; currentCount: number; retryAfter: number }> {
    const now = Date.now();
    const windowStart = now - ttlSeconds * 1000;
    const client = this.getClient();

    if (client) {
      try {
        const pipeline = client.pipeline();
        // Remove timestamps outside current sliding window
        pipeline.zremrangebyscore(key, '-inf', windowStart);
        // Get count within current window
        pipeline.zcard(key);
        // Get oldest element in window to calculate retry-after
        pipeline.zrange(key, 0, 0, 'WITHSCORES');

        const results = await pipeline.exec();
        const currentCount = (results?.[1]?.[1] as number) || 0;

        if (currentCount >= limit) {
          const oldestScores = results?.[2]?.[1] as string[];
          const oldestScore = oldestScores && oldestScores[1] ? Number(oldestScores[1]) : windowStart;
          const retryAfter = Math.max(1, Math.ceil((oldestScore + ttlSeconds * 1000 - now) / 1000));
          return { isLimited: true, currentCount, retryAfter };
        }

        // Add current timestamp and reset key expiration
        const addPipeline = client.pipeline();
        addPipeline.zadd(key, now, `${now}-${Math.random()}`);
        addPipeline.expire(key, ttlSeconds + 1);
        await addPipeline.exec();

        return { isLimited: false, currentCount: currentCount + 1, retryAfter: 0 };
      } catch (err: any) {
        this.logger.warn(`Redis rate limit error, using in-memory fallback: ${err.message}`);
      }
    }

    // In-memory sliding window fallback
    let timestamps = this.memoryStore.get(key) || [];
    timestamps = timestamps.filter((ts) => ts > windowStart);

    if (timestamps.length >= limit) {
      const oldestTs = timestamps[0] || windowStart;
      const retryAfter = Math.max(1, Math.ceil((oldestTs + ttlSeconds * 1000 - now) / 1000));
      this.memoryStore.set(key, timestamps);
      return { isLimited: true, currentCount: timestamps.length, retryAfter };
    }

    timestamps.push(now);
    this.memoryStore.set(key, timestamps);
    return { isLimited: false, currentCount: timestamps.length, retryAfter: 0 };
  }

  /**
   * Blacklist a token (e.g. for logout or revocation)
   */
  async blacklistToken(token: string, ttlSeconds: number = 86400): Promise<void> {
    const client = this.getClient();
    const key = `blacklist:${token}`;

    if (client) {
      try {
        await client.setex(key, ttlSeconds, 'revoked');
        return;
      } catch (err: any) {
        this.logger.warn(`Redis blacklist error, using in-memory: ${err.message}`);
      }
    }

    this.memoryBlacklist.set(token, Date.now() + ttlSeconds * 1000);
  }

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    const client = this.getClient();
    const key = `blacklist:${token}`;

    if (client) {
      try {
        const result = await client.get(key);
        return result !== null;
      } catch (err: any) {
        this.logger.warn(`Redis isBlacklisted check error, using in-memory: ${err.message}`);
      }
    }

    const expiry = this.memoryBlacklist.get(token);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.memoryBlacklist.delete(token);
      return false;
    }
    return true;
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        // Ignore disconnection errors on shutdown
      }
    }
  }
}
