import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import * as crypto from 'crypto';
import { redactSensitiveData } from '../utils/redact.util';

const logger = new Logger('HTTP');

export interface RequestContext {
  requestId: string;
  userId?: string;
  ip: string;
  userAgent: string;
  method: string;
  path: string;
  startTime: number;
}

/** Fields this middleware (and the `@RequestId()`/`@RequestContext()` decorators) attach to the request. */
export interface RequestWithLoggingContext extends Request {
  requestId?: string;
  context?: RequestContext;
  user?: { id?: string; sub?: string };
}

const SENSITIVE_HEADER_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
];

/**
 * Global request logging middleware (#1143).
 *
 * Applied globally via `app.use()` in `main.ts` (before Nest's routing), so
 * it wraps every request regardless of which controller ultimately handles
 * (or fails to handle) it.
 *
 * - Generates (or propagates an inbound `X-Request-Id`) a request ID and
 *   stores it on `req.requestId` / echoes it back as `X-Request-Id`. This is
 *   the same convention `GlobalExceptionFilter` (#1144) reads, so a single
 *   request ID ties a request's access log line to any error it produced.
 * - Logs method, path, final status code, high-precision duration (ms), IP,
 *   user agent and request ID for every request.
 * - Chooses a log level from the response status (>=500 error, >=400 warn,
 *   otherwise info).
 * - Emits structured JSON in production (ELK/Datadog friendly); a compact,
 *   readable line in development.
 * - Redacts sensitive headers (Authorization, Cookie, ...) before logging.
 */
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const typedReq = req as RequestWithLoggingContext;
  const requestId =
    (typedReq.headers['x-request-id'] as string) || crypto.randomUUID();
  typedReq.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();
  const context: RequestContext = {
    requestId,
    ip: typedReq.ip || typedReq.socket?.remoteAddress || 'unknown',
    userAgent: (typedReq.headers['user-agent'] as string) || 'unknown',
    method: typedReq.method,
    path: typedReq.originalUrl || typedReq.path,
    startTime: Date.now(),
  };
  typedReq.context = context;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const statusCode = res.statusCode;
    const isProduction = process.env.NODE_ENV === 'production';
    const userId = typedReq.user?.id || typedReq.user?.sub;

    const entry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: context.method,
      path: context.path,
      statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: context.ip,
      userAgent: context.userAgent,
      ...(userId ? { userId } : {}),
      headers: redactSensitiveData(
        pickHeaders(typedReq.headers, SENSITIVE_HEADER_KEYS),
      ),
    };

    const line = isProduction
      ? JSON.stringify(entry)
      : `${entry.method} ${entry.path} ${statusCode} ${entry.durationMs}ms [${requestId}] ip=${entry.ip}`;

    if (statusCode >= 500) {
      logger.error(line);
    } else if (statusCode >= 400) {
      logger.warn(line);
    } else {
      logger.log(line);
    }
  });

  next();
}

function pickHeaders(
  headers: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (headers[key] !== undefined) {
      picked[key] = headers[key];
    }
  }
  return picked;
}
