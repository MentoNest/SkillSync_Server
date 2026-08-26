import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

export interface RequestContext {
  requestId: string;
  userId?: string;
  ip: string;
  userAgent: string;
  method: string;
  path: string;
  startTime: number;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestIdMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    // Get or generate request ID
    const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();

    // Set request ID on request object
    (req as any).requestId = requestId;

    // Set response header
    res.setHeader('X-Request-Id', requestId);

    // Create request context
    const context: RequestContext = {
      requestId,
      userId: (req as any).user?.id,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      method: req.method,
      path: req.path,
      startTime: Date.now(),
    };

    // Store context on request
    (req as any).context = context;

    // Log request
    this.logger.log(`[${requestId}] ${context.method} ${context.path}`);

    // Handle response finish
    res.on('finish', () => {
      const duration = Date.now() - context.startTime;
      const logLevel = res.statusCode >= 400 ? 'warn' : 'log';

      this.logger[logLevel](
        `[${requestId}] ${context.method} ${context.path} ${res.statusCode} ${duration}ms`,
      );
    });

    next();
  }
}
