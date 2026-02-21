import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RateLimitService } from '../cache/rate-limit.service';
import { ConfigService } from '../../config/config.service';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Skip rate limiting if disabled
    if (!this.configService.rateLimitEnabled) {
      return next();
    }

    // Skip rate limiting for exempt paths
    const exemptPaths = this.configService.rateLimitExemptPaths;
    if (exemptPaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    // Get client IP
    const ip = this.getClientIp(req);
    const key = `global:${ip}`;

    // Apply global rate limiting
    const result = await this.rateLimitService.isAllowed(key, {
      windowMs: this.configService.rateLimitGlobalWindowMs,
      max: this.configService.rateLimitGlobalMax,
      keyPrefix: 'global',
    });

    // Set rate limit headers
    this.setRateLimitHeaders(res, result);

    if (!result.allowed) {
      // Set response status and headers
      res.status(HttpStatus.TOO_MANY_REQUESTS);
      res.setHeader('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000).toString());
      res.setHeader('Content-Type', 'application/json');

      return res.json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too Many Requests',
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      });
    }

    next();
  }

  private getClientIp(req: Request): string {
    // Check for various proxy headers
    return (
      ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  private setRateLimitHeaders(res: Response, result: any): void {
    res.setHeader('X-RateLimit-Limit', this.configService.rateLimitGlobalMax.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.floor(result.resetTime / 1000).toString());
    res.setHeader('X-RateLimit-Current', result.current.toString());
  }
}
