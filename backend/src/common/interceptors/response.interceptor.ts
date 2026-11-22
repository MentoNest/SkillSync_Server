import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';

const STATUS_MESSAGES: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
};

/** Guard for the `{ data, meta }` shape produced by PaginationService. */
function isPaginated(value: unknown): value is { data: unknown[]; meta: Record<string, unknown> } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { data?: unknown; meta?: unknown };
  return Array.isArray(candidate.data) && !!candidate.meta && typeof candidate.meta === 'object';
}

/**
 * Wraps every successful response in one predictable envelope (#1694):
 * `{ success, statusCode, message, data, timestamp, path, requestId }`.
 * Paginated payloads are exposed as `data: { items, meta }` so clients do not
 * have to special-case list endpoints. Errors are handled by AllExceptionsFilter.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();
    const statusCode = response.statusCode ?? HttpStatus.OK;

    return next.handle().pipe(
      map((payload: unknown) => {
        // 204 responses must stay empty.
        if (statusCode === HttpStatus.NO_CONTENT || payload === undefined) return payload;
        return {
          success: true,
          statusCode,
          message: STATUS_MESSAGES[statusCode] ?? 'OK',
          data: isPaginated(payload) ? { items: payload.data, meta: payload.meta } : payload,
          timestamp: new Date().toISOString(),
          path: request.originalUrl ?? request.url,
          requestId: request.id ?? String(request.headers?.['x-request-id'] ?? 'unknown'),
        };
      }),
    );
  }
}
