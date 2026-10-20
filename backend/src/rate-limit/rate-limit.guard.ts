import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { randomUUID } from "crypto";
import type Redis from "ioredis";
import { REDIS } from "../redis/redis.module";
import { THROTTLE_KEY, ThrottleOptions } from "./throttle.decorator";

/**
 * Atomic sliding window on a sorted set: drop old entries, count, add this hit if allowed.
 *
 * Each request is stored as a sorted-set member scored by its timestamp, so
 * counting the members inside the window gives the number of recent requests.
 * Running this as a Lua script makes the whole check-and-add atomic, so two
 * concurrent requests cannot both slip in under the limit.
 *
 * KEYS[1] = rate-limit key
 * ARGV    = now (ms), window (ms), limit, unique member id
 * Returns {allowed (1/0), request count, timestamp}:
 *   - allowed:  {1, count including this request, now}
 *   - rejected: {0, current count, score of the oldest entry in the window}
 */
const SCRIPT = `
local key, now, window, limit, member = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), ARGV[4]
-- Remove entries that have fallen out of the window
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  -- Over the limit: report the oldest entry so the caller can compute when a slot frees up
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, count, tonumber(oldest[2])}
end
-- Under the limit: record this request, and let the key expire on its own
-- once the window passes with no traffic
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1, now}
`;

/**
 * Redis-backed sliding-window rate limiter.
 *
 * Limits can be set per route with the throttle decorator; routes without one
 * fall back to environment-based limits (separate for authenticated users and
 * anonymous IPs). Trusted IPs are exempt.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  /** Fallback limit and window, used when a route has no throttle decorator. */
  private readonly defaults: ThrottleOptions;
  /** IP addresses that bypass rate limiting entirely. */
  private readonly trusted: Set<string>;
  /** If true, requests are allowed through when Redis is unavailable. */
  private readonly failOpen: boolean;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    // Default limit: RATE_LIMIT_DEFAULT if set, otherwise 50 in production
    // and 100 elsewhere. Window defaults to 60 seconds.
    this.defaults = {
      limit: parseInt(
        this.config.get<string>("RATE_LIMIT_DEFAULT") ??
          (this.config.get<string>("NODE_ENV") === "production" ? "50" : "100"),
        10,
      ),
      ttl: parseInt(
        this.config.get<string>("RATE_LIMIT_WINDOW_SECONDS") ?? "60",
        10,
      ),
    };
    // Comma-separated list of IPs, e.g. "10.0.0.1, 10.0.0.2"; whitespace and empty entries are ignored
    this.trusted = new Set(
      (this.config.get<string>("RATE_LIMIT_TRUSTED_IPS") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    // Fails open unless RATE_LIMIT_FAIL_OPEN is explicitly set to "false"
    this.failOpen = this.config.get<string>("RATE_LIMIT_FAIL_OPEN") !== "false";
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Look for throttle options on the handler first, then the controller class;
    // fall back to the defaults if neither has the decorator.
    let opts =
      this.reflector.getAllAndOverride<ThrottleOptions>(THROTTLE_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? this.defaults;
    // A limit of zero or less disables rate limiting for this route
    if (opts.limit <= 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    // Client IP, falling back to the raw socket address
    const ip: string = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    // Trusted IPs skip the limiter completely
    if (this.trusted.has(ip)) return true;

    // Authenticated callers are limited per user, anonymous ones per IP.
    // #1469 — stricter production defaults: auth 50/min, anon 10/min when env set
    const isProd = this.config.get<string>("NODE_ENV") === "production";
    const authLimit = parseInt(
      this.config.get<string>("RATE_LIMIT_AUTH_LIMIT") ??
        (isProd ? "50" : "100"),
      10,
    );
    const anonLimit = parseInt(
      this.config.get<string>("RATE_LIMIT_ANON_LIMIT") ??
        (isProd ? "10" : "100"),
      10,
    );
    // `subject` identifies who is being limited; it becomes part of the Redis key
    const subject = req.user?.sub ? `user:${req.user.sub}` : `ip:${ip}`;
    const effectiveLimit = req.user?.sub ? authLimit : anonLimit;
    // Only routes WITHOUT an explicit throttle decorator get the auth/anon
    // limit; an explicit decorator on the route always wins.
    if (
      !this.reflector.getAllAndOverride(THROTTLE_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      opts = { ...opts, limit: effectiveLimit };
    }
    // Each route has its own counter, so busy endpoints don't use up the
    // budget of others. Prefers the route pattern (e.g. "/users/:id") over
    // the concrete path so different ids share one counter.
    const route = `${req.method}:${req.route?.path ?? req.path}`;
    const windowMs = opts.ttl * 1000;
    const now = Date.now();

    // Values filled in from the Redis script result
    let allowed = true;
    let count = 0;
    let oldest = now;
    try {
      // The member is `timestamp-uuid` so two requests in the same millisecond
      // are stored as separate entries rather than overwriting each other.
      const out = (await this.redis.eval(
        SCRIPT,
        1,
        `rl:${route}:${subject}`,
        now,
        windowMs,
        opts.limit,
        `${now}-${randomUUID()}`,
      )) as number[];
      [allowed, count, oldest] = [out[0] === 1, out[1], out[2]];
    } catch {
      // Redis error: either reject with 503 (fail closed) or let the request through (fail open)
      if (!this.failOpen)
        throw new HttpException(
          "Rate limiter unavailable",
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      return true;
    }

    // Tell clients their limit and how many requests they have left in the window
    res.setHeader("X-RateLimit-Limit", opts.limit);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, opts.limit - count));
    if (!allowed) {
      // Seconds until the oldest request leaves the window and frees a slot (minimum 1)
      const retryAfter = Math.max(
        1,
        Math.ceil((oldest + windowMs - now) / 1000),
      );
      res.setHeader("Retry-After", retryAfter);
      throw new HttpException(
        { statusCode: 429, message: "Too many requests", retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
