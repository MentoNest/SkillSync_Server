import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { THROTTLE_KEY, ThrottleOptions } from '../decorators/throttle.decorator';
import { RedisService } from '../services/redis.service';

@Injectable()
export class ThrottlerGuard implements CanActivate {
  private readonly defaultAuthenticatedLimit = 100;
  private readonly defaultUnauthenticatedLimit = 20;
  private readonly defaultTtl = 60; // 1 minute (60 seconds)
  private readonly trustedIps: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    @Optional()
    private readonly redisService?: RedisService,
  ) {
    const rawWhitelist = process.env.TRUSTED_IPS || '127.0.0.1,::1,localhost';
    this.trustedIps = new Set(rawWhitelist.split(',').map((ip) => ip.trim()).filter(Boolean));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Extract client IP address
    const clientIp = this.getClientIp(request);

    // Bypass rate limiting for trusted IPs
    if (this.isTrustedIp(clientIp)) {
      return true;
    }

    // Retrieve route-specific throttle config if present
    const throttleOptions = this.reflector.getAllAndOverride<ThrottleOptions>(THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Check if request has authenticated user
    const userId = request.user?.id || request.user?.sub || (request as any).userId;
    const isAuthenticated = Boolean(userId);

    // Determine limit and TTL
    let limit = throttleOptions?.limit;
    let ttl = throttleOptions?.ttl ?? this.defaultTtl;

    if (limit === undefined) {
      limit = isAuthenticated ? this.defaultAuthenticatedLimit : this.defaultUnauthenticatedLimit;
    }

    // Build tracking key
    const routeKey = `${request.method}:${request.baseUrl || ''}${request.path || request.url || ''}`;
    const rateLimitKey = isAuthenticated
      ? `rate_limit:user:${userId}:${routeKey}`
      : `rate_limit:ip:${clientIp}:${routeKey}`;

    if (!this.redisService) {
      return true;
    }

    const { isLimited, currentCount, retryAfter } = await this.redisService.checkRateLimit(
      rateLimitKey,
      limit,
      ttl,
    );

    if (isLimited) {
      if (response && typeof response.setHeader === 'function') {
        response.setHeader('Retry-After', retryAfter.toString());
        response.setHeader('X-RateLimit-Limit', limit.toString());
        response.setHeader('X-RateLimit-Remaining', '0');
        response.setHeader('X-RateLimit-Reset', retryAfter.toString());
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests, please try again later.',
          error: 'Too Many Requests',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (response && typeof response.setHeader === 'function') {
      response.setHeader('X-RateLimit-Limit', limit.toString());
      response.setHeader('X-RateLimit-Remaining', Math.max(0, limit - currentCount).toString());
    }

    return true;
  }

  private getClientIp(req: any): string {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
      const firstIp = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0];
      return firstIp.trim();
    }
    return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '127.0.0.1';
  }

  private isTrustedIp(ip: string): boolean {
    return this.trustedIps.has(ip);
  }
}
