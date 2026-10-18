import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { RAW_RESPONSE_KEY } from './raw-response.decorator';
import type { ApiSuccessResponse } from './response-envelope.interface';

const DEFAULT_MESSAGES: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
};

/**
 * Wraps every successful response in a single predictable envelope (#1462).
 *
 * Paginated payloads keep their `data` / `meta` / `links` shape inside the
 * envelope's `data` field, so a list response is still
 * `{ success, statusCode, message, data: { data, meta, links }, ... }` rather
 * than a second, differently-named shape.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessResponse<T> | T> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((payload) => {
        const statusCode = response.statusCode ?? 200;

        // 204/205 must not carry a body; sending one breaks keep-alive framing.
        if (payload === undefined && (statusCode === 204 || statusCode === 205)) {
          return payload;
        }

        return {
          success: true as const,
          statusCode,
          message: DEFAULT_MESSAGES[statusCode] ?? 'OK',
          data: payload ?? null,
          timestamp: new Date().toISOString(),
          path: request.originalUrl || request.url || '',
          ...(request.requestId ? { requestId: request.requestId } : {}),
        };
      }),
    );
  }
}