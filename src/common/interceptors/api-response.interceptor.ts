import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { buildSuccessResponse, SuccessResponse } from '../utils/api-response.util';

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, SuccessResponse<unknown>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle() as Observable<SuccessResponse<unknown>>;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const defaultMessage = this.getDefaultMessage(request.method, response.statusCode);

    return next.handle().pipe(
      map((body) => {
        const normalized = this.normalizeBody(body, defaultMessage);

        return buildSuccessResponse(
          request,
          response.statusCode,
          normalized.message,
          normalized.data,
        );
      }),
    );
  }

  private normalizeBody(
    body: T,
    defaultMessage: string,
  ): {
    message: string;
    data: unknown;
  } {
    if (
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      const { message, ...rest } = body as Record<string, unknown> & {
        message: string;
      };

      if (Object.keys(rest).length === 0) {
        return { message, data: null };
      }

      if ('data' in rest && Object.keys(rest).length === 1) {
        return { message, data: rest.data };
      }

      return { message, data: rest };
    }

    return {
      message: defaultMessage,
      data: body,
    };
  }

  private getDefaultMessage(method: string, statusCode: number): string {
    if (statusCode === 201 || method === 'POST') {
      return 'Resource created successfully';
    }

    if (method === 'PUT' || method === 'PATCH') {
      return 'Request completed successfully';
    }

    if (method === 'DELETE') {
      return 'Resource deleted successfully';
    }

    return 'Request successful';
  }
}
