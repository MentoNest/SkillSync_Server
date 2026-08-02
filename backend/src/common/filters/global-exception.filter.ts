import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * #970: Centralized exception filter.
 *
 * Catches all unhandled exceptions and formats consistent error responses.
 * Logs full error context server-side, returns safe messages to client.
 */

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const res = exResponse as Record<string, unknown>;
        message = (res.message as string) || exception.message;
        code = (res.error as string) || this.codeFromStatus(status);
      }
    } else if (exception instanceof Error) {
      message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception.message;
    }

    const correlationId = request.get('x-correlation-id') || 'unknown';

    // Log full error server-side
    this.logger.error(
      `[${correlationId}] ${request.method} ${request.originalUrl} ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json({
      statusCode: status,
      error: code,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }

  private codeFromStatus(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] || 'ERROR';
  }
}
