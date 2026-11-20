import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { redact, redactHeaders, redactUrl } from './redact';

export type LogLevel = 'info' | 'warn' | 'error';

export interface RequestLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string;
  userAgent: string;
  headers?: Record<string, unknown>;
  body?: unknown;
  error?: { message: string; stack?: string };
}

export interface RequestLoggerOptions {
  /** Where finished log lines go. Defaults to standard output. */
  write?: (line: string) => void;
  /** Defaults to `process.env.NODE_ENV === 'production'`. */
  production?: boolean;
  /** Include (redacted) request headers. Defaults to `LOG_REQUEST_HEADERS=true`. */
  logHeaders?: boolean;
  /** Include the (redacted) request body. Defaults to `LOG_REQUEST_BODY=true`. */
  logBody?: boolean;
  /** Clock in nanoseconds (testing seam). */
  hrtime?: () => bigint;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export function levelForStatus(status: number): LogLevel {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

/** A usable id from the caller's `X-Request-Id` header, or a fresh UUID. */
export function resolveRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

function formatText(entry: RequestLogEntry): string {
  const base = `${entry.timestamp} ${entry.level.toUpperCase()} ${entry.method} ${entry.path} ${entry.statusCode} ${entry.durationMs}ms id=${entry.requestId} ip=${entry.ip}`;
  return entry.error?.stack ? `${base}\n${entry.error.stack}` : base;
}

/**
 * Express middleware (register it with `app.use()`) that logs every request once the
 * response is finished: method, path, status, duration in milliseconds, IP, user agent
 * and a request id (also returned in the `X-Request-Id` response header). Output is one
 * JSON object per line in production and a readable line otherwise; 4xx are `warn`,
 * 5xx `error`. Passwords, tokens and other credentials are redacted, and stack traces
 * appear only outside production.
 */
export function createRequestLogger(options: RequestLoggerOptions = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const logHeaders = options.logHeaders ?? process.env.LOG_REQUEST_HEADERS === 'true';
  const logBody = options.logBody ?? process.env.LOG_REQUEST_BODY === 'true';
  const write = options.write ?? ((line: string) => void process.stdout.write(`${line}\n`));
  const hrtime = options.hrtime ?? (() => process.hrtime.bigint());

  return function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const started = hrtime();
    const requestId = resolveRequestId(req.headers['x-request-id']);
    (req as Request & { id?: string }).id = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const durationMs = Number(hrtime() - started) / 1e6;
      const statusCode = res.statusCode;
      const level = levelForStatus(statusCode);
      const entry: RequestLogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message: 'request completed',
        requestId,
        method: req.method,
        path: redactUrl(req.originalUrl ?? req.url),
        statusCode,
        durationMs: Math.round(durationMs * 1000) / 1000,
        ip: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
        userAgent: String(req.headers['user-agent'] ?? ''),
      };
      if (logHeaders) entry.headers = redactHeaders(req.headers);
      if (logBody && req.body !== undefined) entry.body = redact(req.body);

      // The exception filter leaves the error it handled here.
      const error = res.locals?.error as Error | undefined;
      if (error && level === 'error') {
        entry.error = { message: error.message, ...(production ? {} : { stack: error.stack }) };
      }
      write(production ? JSON.stringify(entry) : formatText(entry));
    });

    next();
  };
}
