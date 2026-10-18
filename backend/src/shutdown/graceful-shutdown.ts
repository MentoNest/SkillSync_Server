import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'http';
import { ShutdownService } from './shutdown.service';

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

/** Refuses new requests with 503 + `Connection: close` once shutdown began. */
export function rejectDuringShutdown(shutdown: ShutdownService) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!shutdown.isShuttingDown()) return next();
    res.setHeader('Connection', 'close');
    res.setHeader('Retry-After', '5');
    res.status(503).json({
      success: false,
      statusCode: 503,
      message: 'Server is shutting down',
      error: 'Service Unavailable',
    });
  };
}

export interface GracefulShutdownOptions {
  app: { close: () => Promise<void>; getHttpServer: () => Server };
  shutdown: ShutdownService;
  timeoutMs?: number;
  /** Injected for tests; defaults to process.exit. */
  exit?: (code: number) => void;
  logger?: Pick<Logger, 'log' | 'error'>;
}

/**
 * Handles SIGTERM / SIGINT: stop accepting connections, wait for in-flight
 * requests, close the Nest app (database and Redis connections close in their
 * lifecycle hooks) and exit. Forces exit with code 1 after `timeoutMs`.
 * Returns the handler so tests can invoke it without sending signals.
 */
export function createShutdownHandler(options: GracefulShutdownOptions) {
  const { app, shutdown } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const logger = options.logger ?? new Logger('Shutdown');
  let started = false;

  return async (signal: string): Promise<void> => {
    if (started) return;
    started = true;
    shutdown.begin();
    logger.log(`${signal} received: draining connections (timeout ${timeoutMs}ms)`);

    const force = setTimeout(() => {
      logger.error(`Shutdown exceeded ${timeoutMs}ms; forcing exit`);
      exit(1);
    }, timeoutMs);
    force.unref?.();

    try {
      // Stops accepting new connections; resolves once in-flight requests end.
      await new Promise<void>((resolve) => app.getHttpServer().close(() => resolve()));
      await app.close();
      clearTimeout(force);
      exit(0);
    } catch (err) {
      clearTimeout(force);
      logger.error(`Error during shutdown: ${(err as Error).message}`);
      exit(1);
    }
  };
}

export function registerGracefulShutdown(options: GracefulShutdownOptions): void {
  const handler = createShutdownHandler(options);
  process.on('SIGTERM', () => void handler('SIGTERM'));
  process.on('SIGINT', () => void handler('SIGINT'));
}
