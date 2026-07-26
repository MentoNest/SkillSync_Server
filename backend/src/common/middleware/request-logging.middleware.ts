import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * #969: Structured request logging middleware.
 *
 * Logs each incoming request with method, path, status, duration, and timestamp.
 * In production, outputs JSON for log aggregation; in development, human-readable format.
 */

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const correlationId = req.get('x-correlation-id') || this.generateCorrelationId();

    // Attach correlation ID to response
    res.setHeader('x-correlation-id', correlationId);

    // Log on response finish
    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const { statusCode } = res;
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        method,
        path: originalUrl,
        statusCode,
        durationMs,
        ip,
        userAgent,
        correlationId,
      };

      if (this.isProduction) {
        console.log(JSON.stringify(logEntry));
      } else {
        const color = statusCode >= 500 ? '\x1b[31m' : statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
        const reset = '\x1b[0m';
        console.log(
          `${color}${method} ${originalUrl} ${statusCode}${reset} ${durationMs}ms [${correlationId}]`,
        );
      }
    });

    next();
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }
}
