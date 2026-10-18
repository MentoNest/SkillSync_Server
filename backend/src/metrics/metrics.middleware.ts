import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  activeConnections,
  httpRequestDuration,
  httpRequestsTotal,
} from './metrics.registry';

let inFlight = 0;

/**
 * Low-overhead HTTP metrics. In-memory only — no I/O on the request path (#1473).
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/metrics' || req.path === '/health') {
      next();
      return;
    }

    inFlight += 1;
    activeConnections.set(inFlight);
    const start = process.hrtime.bigint();

    const done = () => {
      inFlight = Math.max(0, inFlight - 1);
      activeConnections.set(inFlight);
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      const path = (req.route?.path as string) || req.path || 'unknown';
      httpRequestsTotal.inc({
        method: req.method,
        path: String(path),
        status: String(res.statusCode),
      });
      httpRequestDuration.observe(seconds, {
        method: req.method,
        path: String(path),
      });
    };

    res.on('finish', done);
    res.on('close', done);

    next();
  }
}
