import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  FieldError,
  ValidationFailedException,
} from '../errors/app-exceptions';
import { codeForStatus, ErrorCode } from '../errors/error-codes';

export interface ErrorResponseBody {
  success: boolean;
  statusCode: number;
  message: string;
  error: string;
  code: ErrorCode | string;
  timestamp: string;
  path: string;
  requestId: string;
  errors?: FieldError[];
  stack?: string;
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

function messageFrom(response: unknown, fallback: string): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const message = (response as { message?: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join('; ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

/**
 * Catches everything the application throws and answers with one JSON shape:
 * `{ success: false, statusCode, message, error, code, timestamp, path, requestId }` (plus `errors` for
 * validation failures). Unknown errors become a generic 500 without internals, and stack
 * traces are only included outside production.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(
    private readonly production: boolean = process.env.NODE_ENV ===
      'production',
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();

    const body = this.buildBody(exception, request);
    // The request logger picks this up to log server errors with their stack.
    response.locals = { ...(response.locals ?? {}), error: exception };

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode}: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    response.status(body.statusCode).json(body);
  }

  buildBody(
    exception: unknown,
    request: Request & { id?: string },
  ): ErrorResponseBody {
    const timestamp = new Date().toISOString();
    const path = request.originalUrl ?? request.url;
    const requestId =
      request.id ?? String(request.headers?.['x-request-id'] ?? 'unknown');

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const object =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const body: ErrorResponseBody = {
        success: false,
        statusCode: status,
        message: messageFrom(raw, exception.message),
        error:
          typeof object.error === 'string'
            ? object.error
            : (STATUS_TEXT[status] ?? 'Error'),
        code:
          typeof object.code === 'string' ? object.code : codeForStatus(status),
        timestamp,
        path,
        requestId,
      };
      if (exception instanceof ValidationFailedException)
        body.errors = exception.fieldErrors;
      if (status >= 500 && !this.production && exception.stack)
        body.stack = exception.stack;
      return body;
    }

    // Unknown error: never expose its message or internals.
    const body: ErrorResponseBody = {
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: STATUS_TEXT[HttpStatus.INTERNAL_SERVER_ERROR],
      code: ErrorCode.INTERNAL_ERROR,
      timestamp,
      path,
      requestId,
    };
    if (!this.production && exception instanceof Error && exception.stack)
      body.stack = exception.stack;
    return body;
  }
}
