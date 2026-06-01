import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { requestContextStorage } from '../contexts/request-id.context';
import {
  extractOrGenerateRequestId,
  setRequestIdHeader,
} from '../utils/request-id.util';

// ─── Sensitive field patterns ────────────────────────────────────────────────
const SENSITIVE_KEYS = /password|token|secret|authorization|cookie|credit.?card|ssn|cvv/i;
const REDACTED = '[REDACTED]';

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Redact bearer tokens inline in string values
    return obj.replace(/Bearer\s+\S+/gi, `Bearer ${REDACTED}`);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.test(key) ? REDACTED : redact(value, depth + 1);
    }
    return result;
  }

  return obj;
}

function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  return redact(headers) as Record<string, unknown>;
}

// ─── Logger ──────────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production';

function log(level: 'info' | 'warn' | 'error', payload: Record<string, unknown>): void {
  const entry = JSON.stringify({ level, ...payload });

  if (isDev) {
    // Pretty-print in development
    const colors = { info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
    const reset = '\x1b[0m';
    console[level](`${colors[level]}${entry}${reset}`);
  } else {
    // Raw JSON for log aggregators (ELK / Datadog)
    process.stdout.write(entry + '\n');
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = extractOrGenerateRequestId(req);
    const startAt = process.hrtime.bigint();

    // Attach request ID to request headers and response headers
    req.headers['x-request-id'] = requestId;
    setRequestIdHeader(res, requestId);

    // Run the request within request context so all async operations have access to requestId
    requestContextStorage.run({ requestId }, () => {
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
        req.socket.remoteAddress ??
        'unknown';

      res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startAt) / 1_000_000;
        const status = res.statusCode;

        const base: Record<string, unknown> = {
          timestamp: new Date().toISOString(),
          requestId,
          method: req.method,
          path: req.originalUrl,
          status,
          durationMs: parseFloat(durationMs.toFixed(3)),
          ip,
          userAgent: req.headers['user-agent'] ?? 'unknown',
          headers: sanitizeHeaders(req.headers as Record<string, unknown>),
        };

        // Include redacted body when present
        if (req.body && Object.keys(req.body as object).length > 0) {
          base.body = redact(req.body);
        }

        if (status >= 500) {
          const err = (res as unknown as { locals?: { error?: Error } }).locals?.error;
          log('error', {
            ...base,
            // Stack traces only in development
            ...(isDev && err?.stack ? { stack: err.stack } : {}),
          });
        } else if (status >= 400) {
          log('warn', base);
        } else {
          log('info', base);
        }
      });

      next();
    });
  }
}
