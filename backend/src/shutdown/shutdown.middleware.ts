import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ShutdownService } from './shutdown.service';

/**
 * Express middleware (register it with `app.use()`) that rejects requests arriving
 * while a graceful shutdown is in progress with `503 Service Unavailable`.
 *
 * The HTTP server stops accepting new connections as soon as it closes, but
 * already-established keep-alive connections may still send requests; this
 * middleware answers those with `503` instead of letting them hit the application.
 */
export function createShutdownMiddleware(shutdown: ShutdownService) {
  const logger = new Logger('ShutdownMiddleware');

  return function shutdownMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!shutdown.isShuttingDown()) {
      next();
      return;
    }

    logger.warn(`Rejecting ${req.method} ${req.originalUrl ?? req.url} - server is shutting down.`);
    res.setHeader('Connection', 'close');
    res.setHeader('Retry-After', '1');
    res.status(503).json({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Server is shutting down and no longer accepting requests.',
    });
  };
}
