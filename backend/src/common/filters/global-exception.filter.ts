import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode, errorCodeFromStatus } from '../exceptions/error-codes.enum';
import {
  FieldError,
  ValidationException,
} from '../exceptions/validation.exception';
import { RequestWithLoggingContext } from '../middleware/logging.middleware';

export interface ErrorResponseBody {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  requestId: string;
  errors?: FieldError[];
  stack?: string;
}

/**
 * Centralized exception filter (#1144).
 *
 * `@Catch()` (no argument) means this catches *everything* — known Nest
 * HttpExceptions (BadRequest/NotFound/Unauthorized/...) thrown anywhere in
 * controllers, guards, interceptors or async handlers, as well as truly
 * unexpected errors — and always returns the same JSON shape:
 *
 *   { statusCode, message, error, timestamp, path, requestId }
 *
 * `requestId` is read from `req.requestId`, the same field the global
 * request logging middleware (#1143) sets on every request — so a client
 * (or a log search) can correlate an error response with its access log
 * line using one ID.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithLoggingContext>();
    const isProduction = process.env.NODE_ENV === 'production';
    const requestId =
      request?.requestId ||
      (request?.headers?.['x-request-id'] as string) ||
      'unknown';

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode: string = errorCodeFromStatus(status);
    let fieldErrors: FieldError[] | undefined;

    if (exception instanceof ValidationException) {
      status = exception.getStatus();
      message = 'Validation failed';
      errorCode = ErrorCode.VALIDATION_ERROR;
      fieldErrors = exception.fieldErrors;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        message = Array.isArray(record.message)
          ? (record.message as string[]).join('; ')
          : ((record.message as string) ?? exception.message);
        errorCode = (record.error as string) || errorCodeFromStatus(status);
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      // Unknown/unexpected error — never leak internals to the client.
      message = isProduction ? 'Internal server error' : exception.message;
    }

    const stack = exception instanceof Error ? exception.stack : undefined;

    // Always log full context + stack server-side (regardless of env) —
    // only the HTTP response body hides the stack trace in production.
    const logLine = `[${requestId}] ${request?.method} ${request?.originalUrl} -> ${status} ${message}`;
    if (status >= 500) {
      this.logger.error(logLine, stack);
    } else {
      this.logger.warn(logLine);
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      message,
      error: errorCode,
      timestamp: new Date().toISOString(),
      path: request?.originalUrl ?? request?.url ?? '',
      requestId,
      ...(fieldErrors ? { errors: fieldErrors } : {}),
      ...(!isProduction && stack ? { stack } : {}),
    };

    response.status(status).json(body);
  }
}
