import { Injectable, CanActivate, ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService, RateLimitConfig, RateLimitResult } from '../cache/rate-limit.service';

export interface RateLimitOptions extends RateLimitConfig {
  keyGenerator?: (req: any) => string;
  skipIf?: (req: any) => boolean | Promise<boolean>;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Check if rate limiting should be skipped
    const skipCondition = this.reflector.get<
      ((req: any) => boolean | Promise<boolean>) | undefined
    >('rateLimitSkip', context.getHandler());

    if (skipCondition && (await skipCondition(request))) {
      return true;
    }

    // Get rate limit options from decorator or use defaults
    const options = this.reflector.get<RateLimitOptions>('rateLimitOptions', context.getHandler());

    const config: RateLimitConfig = {
      windowMs: options?.windowMs || 60000, // 1 minute default
      max: options?.max || 100, // 100 requests default
      keyPrefix: options?.keyPrefix || 'rate',
    };

    // Generate key based on IP by default, or custom key generator
    const keyGenerator =
      options?.keyGenerator ||
      ((req: any) => {
        const ip =
          req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
        return `ip:${ip}`;
      });

    const key = keyGenerator(request);
    const result: RateLimitResult = await this.rateLimitService.isAllowed(key, config);

    // Set rate limit headers
    this.setRateLimitHeaders(response, result, config);

    if (!result.allowed) {
      // Set response status and throw error
      response.status(HttpStatus.TOO_MANY_REQUESTS);
      response.setHeader(
        'Retry-After',
        Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
      );

      throw new Error('Too Many Requests');
    }

    return true;
  }

  private setRateLimitHeaders(
    response: any,
    result: RateLimitResult,
    config: RateLimitConfig,
  ): void {
    response.setHeader('X-RateLimit-Limit', config.max.toString());
    response.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    response.setHeader('X-RateLimit-Reset', Math.floor(result.resetTime / 1000).toString());

    // Add custom header for debugging
    response.setHeader('X-RateLimit-Current', result.current.toString());
  }
}
