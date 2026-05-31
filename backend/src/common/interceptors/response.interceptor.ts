import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';

export interface ResponseEnvelope<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ResponseEnvelope<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    const statusCode = response.statusCode;
    const path = request.originalUrl || request.url || '';
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((data) => {
        // If data is already an envelope, return it as is
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'statusCode' in data
        ) {
          return data;
        }

        // Determine message
        let message = 'Operation successful';
        if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
          message = data.message;
          // Optionally remove message from data if you don't want it duplicated
          // delete data.message;
        }

        return {
          success: true,
          statusCode,
          message,
          data: data !== undefined ? data : null,
          timestamp,
          path,
        };
      }),
    );
  }
}
