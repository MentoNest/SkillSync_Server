import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { THROTTLE_KEY, ThrottleOptions } from './throttle.decorator';

/** Atomic sliding window on a sorted set: drop old entries, count, add this hit if allowed. */
const SCRIPT = `
local key, now, window, limit, member = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, count, tonumber(oldest[2])}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1, now}
`;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaults: ThrottleOptions;
  private readonly trusted: Set<string>;
  private readonly failOpen: boolean;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    this.defaults = {
      limit: parseInt(
        this.config.get<string>('RATE_LIMIT_DEFAULT') ??
          (this.config.get<string>('NODE_ENV') === 'production' ? '50' : '100'),
        10,
      ),
      ttl: parseInt(this.config.get<string>('RATE_LIMIT_WINDOW_SECONDS') ?? '60', 10),
    };
    this.trusted = new Set(
      (this.config.get<string>('RATE_LIMIT_TRUSTED_IPS') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    this.failOpen = this.config.get<string>('RATE_LIMIT_FAIL_OPEN') !== 'false';
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    let opts =
      this.reflector.getAllAndOverride<ThrottleOptions>(THROTTLE_KEY, [ctx.getHandler(), ctx.getClass()]) ??
      this.defaults;
    if (opts.limit <= 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const ip: string = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    if (this.trusted.has(ip)) return true;

    // Authenticated callers are limited per user, anonymous ones per IP.
    // #1469 — stricter production defaults: auth 50/min, anon 10/min when env set
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const authLimit = parseInt(this.config.get<string>('RATE_LIMIT_AUTH_LIMIT') ?? (isProd ? '50' : '100'), 10);
    const anonLimit = parseInt(this.config.get<string>('RATE_LIMIT_ANON_LIMIT') ?? (isProd ? '10' : '100'), 10);
    const subject = req.user?.sub ? `user:${req.user.sub}` : `ip:${ip}`;
    const effectiveLimit = req.user?.sub ? authLimit : anonLimit;
    if (!this.reflector.getAllAndOverride(THROTTLE_KEY, [ctx.getHandler(), ctx.getClass()])) {
      opts = { ...opts, limit: effectiveLimit };
    }
    const route = `${req.method}:${req.route?.path ?? req.path}`;
    const windowMs = opts.ttl * 1000;
    const now = Date.now();

    let allowed = true;
    let count = 0;
    let oldest = now;
    try {
      const out = (await this.redis.eval(SCRIPT, 1, `rl:${route}:${subject}`, now, windowMs, opts.limit, `${now}-${randomUUID()}`)) as number[];
      [allowed, count, oldest] = [out[0] === 1, out[1], out[2]];
    } catch {
      if (!this.failOpen) throw new HttpException('Rate limiter unavailable', HttpStatus.SERVICE_UNAVAILABLE);
      return true;
    }

    res.setHeader('X-RateLimit-Limit', opts.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, opts.limit - count));
    if (!allowed) {
      const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('Retry-After', retryAfter);
      throw new HttpException({ statusCode: 429, message: 'Too many requests', retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
