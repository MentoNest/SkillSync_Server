import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response as ExpressResponse } from 'express';
import { randomUUID } from 'crypto';

export interface ApiSuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
  requestId: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiSuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<T>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<ExpressResponse>();

    // Attach a requestId for tracing; re-use one already set by upstream middleware
    const requestId: string =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    res.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        statusCode: res.statusCode,
        message: 'OK',
        data,
        timestamp: new Date().toISOString(),
        path: req.url,
        requestId,
      })),
    );
  }
}
