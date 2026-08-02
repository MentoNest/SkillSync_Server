import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RedisService } from '../../config/redis.module.js';

/**
 * #980: Rate limiting guard with Redis-backed sliding window.
 *
 * Supports per-IP and per-user tracking with configurable limits per route.
 * Returns 429 with Retry-After header when limit exceeded.
 */

export interface ThrottleConfig {
  ttl: number; // Window in seconds
  limit: number; // Max requests per window
}

export const THROTTLE_KEY = 'throttle';

/**
 * @Throttle decorator: @Throttle(10, 60) = 10 requests per 60 seconds
 */
export const Throttle = (limit: number, ttl: number) => {
  return (
    target: object,
    propertyKey?: string,
    descriptor?: PropertyDescriptor,
  ) => {
    if (descriptor) {
      Reflect.defineMetadata(THROTTLE_KEY, { limit, ttl }, descriptor.value);
    }
  };
};

const DEFAULT_AUTHENTICATED: ThrottleConfig = { ttl: 60, limit: 100 };
const DEFAULT_UNAUTHENTICATED: ThrottleConfig = { ttl: 60, limit: 20 };

@Injectable()
export class ThrottlerGuard implements CanActivate {
  private readonly logger = new Logger(ThrottlerGuard.name);
  private trustedIps = new Set(
    (process.env.TRUSTED_IPS || '').split(',').filter(Boolean),
  );

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const customConfig = this.reflector.get<ThrottleConfig>(
      THROTTLE_KEY,
      handler,
    );

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const res = context.switchToHttp().getResponse<Response>();

    const isAuthenticated = !!req.user;
    const clientId = isAuthenticated
      ? `user:${JSON.stringify(req.user).slice(0, 20)}`
      : `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;

    // Skip rate limiting for trusted IPs
    if (this.trustedIps.has(req.ip || '')) {
      return true;
    }

    const config =
      customConfig ||
      (isAuthenticated ? DEFAULT_AUTHENTICATED : DEFAULT_UNAUTHENTICATED);
    const key = `rl:${clientId}:${handler?.name || 'default'}`;

    // Sliding window using sorted set
    const now = Date.now();
    const windowStart = now - config.ttl * 1000;

    // Remove expired entries and count current
    const storeKey = key;
    const entries = await this.redisService.get(storeKey);

    let count = 0;
    let timestamps: number[] = [];

    if (entries) {
      try {
        timestamps = JSON.parse(entries) as number[];
        timestamps = timestamps.filter((t: number) => t > windowStart);
        count = timestamps.length;
      } catch {
        timestamps = [];
      }
    }

    if (count >= config.limit) {
      const oldestInWindow = Math.min(...timestamps);
      const retryAfterSeconds = Math.ceil(
        (oldestInWindow + config.ttl * 1000 - now) / 1000,
      );

      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('X-RateLimit-Limit', String(config.limit));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader(
        'X-RateLimit-Reset',
        String(Math.ceil((oldestInWindow + config.ttl * 1000) / 1000)),
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'RATE_LIMITED',
          message: `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Record this request
    timestamps.push(now);
    await this.redisService.set(
      storeKey,
      JSON.stringify(timestamps),
      config.ttl,
    );

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', String(config.limit));
    res.setHeader('X-RateLimit-Remaining', String(config.limit - count - 1));
    res.setHeader(
      'X-RateLimit-Reset',
      String(Math.ceil((windowStart + config.ttl * 1000) / 1000)),
    );

    return true;
  }
}
