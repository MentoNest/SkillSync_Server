import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum requests allowed
  keyPrefix?: string; // Optional prefix for Redis keys
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  remaining: number;
  resetTime: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly cache: CacheService) {}

  /**
   * Check if a request is allowed based on rate limit configuration
   * @param key Unique identifier (IP, wallet, etc.)
   * @param config Rate limit configuration
   * @returns RateLimitResult with allowance status and metadata
   */
  async isAllowed(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const cacheKey = `${config.keyPrefix || 'rate'}:${key}`;
    const windowSeconds = Math.floor(config.windowMs / 1000);

    try {
      // Get current count
      const currentCount = await this.cache.get(cacheKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      // If this is the first request in the window, set the expiry
      if (count === 0) {
        await this.cache.set(cacheKey, '1', windowSeconds);
        return {
          allowed: true,
          current: 1,
          remaining: config.max - 1,
          resetTime: Date.now() + config.windowMs,
        };
      }

      // If we're at the limit, deny the request
      if (count >= config.max) {
        const ttl = await this.getTTL();
        return {
          allowed: false,
          current: count,
          remaining: 0,
          resetTime: Date.now() + ttl * 1000,
        };
      }

      // Increment the counter
      await this.cache.increment(cacheKey, windowSeconds);

      return {
        allowed: true,
        current: count + 1,
        remaining: Math.max(0, config.max - count - 1),
        resetTime: Date.now() + config.windowMs,
      };
    } catch (error) {
      this.logger.error(`Rate limit check failed for key ${key}:`, error);
      // Fail open - allow the request if Redis is unavailable
      return {
        allowed: true,
        current: 0,
        remaining: config.max,
        resetTime: Date.now() + config.windowMs,
      };
    }
  }

  /**
   * Get TTL (time to live) for a key in seconds
   */
  private getTTL(): Promise<number> {
    // This would require a Redis command to get TTL
    // For now, we'll return the window size as approximation
    return Promise.resolve(60); // Default fallback
  }

  /**
   * Reset rate limit counter for a key
   */
  async reset(key: string, keyPrefix?: string): Promise<void> {
    const cacheKey = `${keyPrefix || 'rate'}:${key}`;
    await this.cache.del(cacheKey);
  }

  /**
   * Get current rate limit status without incrementing
   */
  async getStatus(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const cacheKey = `${config.keyPrefix || 'rate'}:${key}`;

    try {
      const currentCount = await this.cache.get(cacheKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      return {
        allowed: count < config.max,
        current: count,
        remaining: Math.max(0, config.max - count),
        resetTime: Date.now() + config.windowMs,
      };
    } catch (error) {
      this.logger.error(`Rate limit status check failed for key ${key}:`, error);
      return {
        allowed: true,
        current: 0,
        remaining: config.max,
        resetTime: Date.now() + config.windowMs,
      };
    }
  }

  /**
   * Simple increment method (backward compatibility)
   */
  async increment(key: string, ttl = 60): Promise<number> {
    return this.cache.increment(`rate:${key}`, ttl);
  }
}
