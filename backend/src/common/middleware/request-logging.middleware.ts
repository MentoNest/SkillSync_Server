import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { redactSensitiveData } from '../utils/redact.util';
import { isSafeRequestId, runWithRequestContext } from '../request-context/request-context';

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

export interface RequestWithLoggingContext extends Request {
  requestId?: string;
  context?: RequestContext;
  user?: { sub?: string };
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const typedReq = req as RequestWithLoggingContext;
  // Reuse a client/proxy id only when it is well-formed; otherwise mint one.
  const incoming = typedReq.headers['x-request-id'];
  const requestId = isSafeRequestId(incoming) ? incoming : randomUUID();
  typedReq.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();
  const context: RequestContext = {
    requestId,
    ip: typedReq.ip || typedReq.socket?.remoteAddress || 'unknown',
    userAgent: (typedReq.headers['user-agent'] as string | undefined) || 'unknown',
    method: typedReq.method,
    path: typedReq.originalUrl || typedReq.path,
    startTime: Date.now(),
  };
  typedReq.context = context;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const statusCode = res.statusCode;
    const isProduction = process.env.NODE_ENV === 'production';
    const userId = typedReq.user?.sub;

    const entry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: context.method,
      path: context.path,
      statusCode,
      durationMs: Math.round(durationMs * 1000) / 1000,
      ip: context.ip,
      userAgent: context.userAgent,
      ...(userId ? { userId } : {}),
      headers: redactSensitiveData(typedReq.headers),
      body: redactSensitiveData(typedReq.body),
    };

    const line = isProduction
      ? JSON.stringify(entry)
      : `${entry.method} ${entry.path} ${statusCode} ${entry.durationMs}ms [${requestId}] ip=${entry.ip} ua=${JSON.stringify(entry.userAgent)}`;

    if (statusCode >= 500) {
      const stack = !isProduction ? (res.locals?.errorStack as string | undefined) : undefined;
      if (stack) logger.error(line, stack);
      else logger.error(line);
    } else if (statusCode >= 400) {
      logger.warn(line);
    } else {
      logger.log(line);
    }
  });

  // Everything downstream (handlers, loggers, DB calls) sees the request id.
  runWithRequestContext({ requestId }, () => next());
}
