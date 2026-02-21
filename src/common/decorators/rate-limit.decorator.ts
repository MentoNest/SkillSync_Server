import { SetMetadata } from '@nestjs/common';
import { RateLimitOptions } from '../guards/rate-limit.guard';

export const RATE_LIMIT_OPTIONS = 'rateLimitOptions';
export const RATE_LIMIT_SKIP = 'rateLimitSkip';

/**
 * Apply rate limiting to a route handler
 * @param options Rate limiting configuration
 */
export const RateLimit = (options?: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_OPTIONS, options || {});

/**
 * Skip rate limiting for specific routes
 * @param condition Function that returns true to skip rate limiting
 */
export const SkipRateLimit = (condition?: (req: any) => boolean | Promise<boolean>) =>
  SetMetadata(RATE_LIMIT_SKIP, condition || (() => true));

// Predefined rate limit configurations
export const RateLimits = {
  /**
   * Strict rate limiting - 10 requests per minute
   */
  STRICT: {
    windowMs: 60000,
    max: 10,
    keyPrefix: 'strict',
  },

  /**
   * Normal rate limiting - 100 requests per minute
   */
  NORMAL: {
    windowMs: 60000,
    max: 100,
    keyPrefix: 'normal',
  },

  /**
   * Relaxed rate limiting - 1000 requests per minute
   */
  RELAXED: {
    windowMs: 60000,
    max: 1000,
    keyPrefix: 'relaxed',
  },

  /**
   * Per-wallet rate limiting - 50 requests per minute per wallet
   */
  WALLET: {
    windowMs: 60000,
    max: 50,
    keyPrefix: 'wallet',
    keyGenerator: (req: any) => {
      const wallet = req.headers['x-wallet-address'] || req.body?.walletAddress || 'unknown';
      return `wallet:${wallet}`;
    },
  },

  /**
   * Per-user rate limiting - 200 requests per minute per user
   */
  USER: {
    windowMs: 60000,
    max: 200,
    keyPrefix: 'user',
    keyGenerator: (req: any) => {
      const userId = req.user?.id || req.headers['x-user-id'] || 'anonymous';
      return `user:${userId}`;
    },
  },
};
