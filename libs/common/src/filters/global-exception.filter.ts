import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '../exceptions/app-error';
import { ErrorCodes } from '../exceptions/error-codes.enum';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let payload: Record<string, unknown> = {
      statusCode: status,
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
      code: ErrorCodes.GENERIC,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof AppError) {
      // AppError already structures message/code/details
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const res: any = exception.getResponse();
      status = exception.getStatus();
      payload = {
        statusCode: status,
        error: res.error ?? exception.name,
        message: res.message ?? exception.message,
        code: res.code ?? (exception as AppError).code,
        details: res.details ?? (exception as AppError).details,
        path: request.url,
        timestamp: new Date().toISOString(),
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const res: any = exception.getResponse();
      payload = {
        statusCode: status,
        error: res.error ?? exception.name,
        message: res.message ?? exception.message,
        code: res.code ?? ErrorCodes.GENERIC,
        details: res.details,
        path: request.url,
        timestamp: new Date().toISOString(),
      };
    }

    // Structured error logging for observability / tracking
    try {
      const logPayload = {
        level: 'error',
        message:
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          (payload['message'] as unknown) ?? 'Unhandled exception',
        error: exception instanceof Error ? exception.stack : exception,
        request: {
          method: request.method,
          url: request.url,
          params: request.params,
          query: request.query,
        },
        code: payload['code'],
        timestamp: new Date().toISOString(),
      };

      // Replace with an external tracker (Sentry, Datadog) integration here
      // For now, print structured JSON to console so logs can be parsed.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      console.error(JSON.stringify(logPayload));
    } catch (logErr) {
      // If logging fails, still respond to client
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      console.error('Failed to log error', logErr);
    }

    response.status(status).json(payload);
  }
}
