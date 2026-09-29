import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RequestWithLoggingContext } from '../middleware/logging.middleware.js';

export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
  requestId: string;
}

/**
 * Wraps all successful responses in a consistent API envelope.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | T> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithLoggingContext>();
    const response = httpContext.getResponse<Response>();
    const requestId =
      request.requestId ||
      (request.headers['x-request-id'] as string | undefined) ||
      'unknown';

    return next.handle().pipe(
      map((data: T): ApiResponse<T> => ({
        success: true,
        statusCode: response.statusCode,
        message: 'Success',
        data,
        timestamp: new Date().toISOString(),
        path: request.originalUrl || request.url,
        requestId,
      })),
    );
  }
}
