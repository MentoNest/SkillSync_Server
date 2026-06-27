import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { THROTTLE_KEY, ThrottleOptions } from './throttle.decorator';
import { ThrottlerService } from './throttler.service';

// Global defaults
const DEFAULT_AUTHENTICATED_LIMIT = 100;
const DEFAULT_UNAUTHENTICATED_LIMIT = 20;
const DEFAULT_TTL = 60; // seconds

@Injectable()
export class ThrottlerGuard implements CanActivate {
  private readonly trustedIps: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    private readonly throttlerService: ThrottlerService,
  ) {
    const raw = process.env.THROTTLE_TRUSTED_IPS || '';
    this.trustedIps = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<ThrottleOptions | null>(THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // null means @SkipThrottle()
    if (meta === null) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const res = context.switchToHttp().getResponse<Response>();

    const ip = this.extractIp(req);

    // Bypass for trusted IPs
    if (this.trustedIps.has(ip)) return true;

    const userId = req.user?.sub;
    const isAuthenticated = Boolean(userId);

    const limit = meta?.limit ?? (isAuthenticated ? DEFAULT_AUTHENTICATED_LIMIT : DEFAULT_UNAUTHENTICATED_LIMIT);
    const ttl = meta?.ttl ?? DEFAULT_TTL;

    // Use userId for authenticated requests, IP otherwise
    const identifier = userId ? `user:${userId}` : `ip:${ip}`;
    // Scope per route to avoid cross-endpoint interference
    const routeKey = `${context.getClass().name}:${context.getHandler().name}:${identifier}`;

    const result = await this.throttlerService.check(routeKey, limit, ttl);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter);
      throw new HttpException(
        { statusCode: 429, message: 'Too Many Requests', retryAfter: result.retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return first.trim();
    }
    return req.socket?.remoteAddress ?? '0.0.0.0';
  }
}
