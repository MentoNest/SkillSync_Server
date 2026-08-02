import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Request } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
}

export interface PaginatedData<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const statusCode = ctx.getResponse().statusCode;

    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'meta' in data && 'data' in data) {
          return {
            success: true,
            statusCode,
            message: 'Success',
            data: {
              items: data.data,
              meta: data.meta,
            },
            timestamp: new Date().toISOString(),
            path: request.originalUrl,
          };
        }

        return {
          success: true,
          statusCode,
          message: 'Success',
          data: data ?? null,
          timestamp: new Date().toISOString(),
          path: request.originalUrl,
        };
      }),
    );
  }
}
