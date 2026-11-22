import type { NextFunction, Request, Response } from 'express';
import { ErrorCode } from '../errors/error-codes';
import type { RateLimitConfig } from '../../config/app.config';

interface RateBucket {
  count: number;
  resetAt: number;
}

/** Paths that must remain available for container orchestrators and smoke checks. */
const EXEMPT_PATHS = ['/', '/health', '/redis/health', '/api/docs'];

/**
 * Small in-process fixed-window limiter. It is installed at the HTTP adapter
 * level so unauthenticated requests are throttled before guards run. Deployments
 * behind several instances should put a shared limiter (e.g. Redis) in front of
 * them; the per-instance limits remain a useful second line of defence.
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const buckets = new Map<string, RateBucket>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    if (!config.enabled || EXEMPT_PATHS.includes(req.path)) {
      next();
      return;
    }

    const now = Date.now();
    // Bound memory growth when traffic comes from many addresses.
    if (buckets.size > 10_000) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }

    const bearer = req.headers.authorization?.startsWith('Bearer ');
    const limit = bearer ? config.authenticatedMax : config.unauthenticatedMax;
    const key = `${bearer ? 'auth' : 'anon'}:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    } else {
      bucket.count += 1;
    }

    const current = buckets.get(key)!;
    const remaining = Math.max(0, limit - current.count);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader(
      'X-RateLimit-Reset',
      String(Math.ceil(current.resetAt / 1000)),
    );

    if (current.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
      res.status(429).json({
        statusCode: 429,
        message: 'Too many requests, please try again later',
        error: 'Too Many Requests',
        code: ErrorCode.RATE_LIMITED,
      });
      return;
    }
    next();
  };
}
