import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import type { ValidationError } from 'class-validator';
import { ErrorCode, errorCodeFor } from '../constants/error-codes';
import { ValidationException } from '../exceptions/validation.exception';

export interface FieldErrors {
  field: string;
  errors: string[];
}

export interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  code: string;
  timestamp: string;
  path: string;
  requestId: string;
  details?: FieldErrors[];
  stack?: string;
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

function statusTextFor(statusCode: number): string {
  return STATUS_TEXT[statusCode] ?? 'Error';
}

export function formatValidationErrors(errors: ValidationError[]): FieldErrors[] {
  const result: FieldErrors[] = [];
  const walk = (nodes: ValidationError[], prefix: string): void => {
    for (const node of nodes) {
      const field = prefix ? `${prefix}.${node.property}` : node.property;
      if (node.constraints) {
        result.push({ field, errors: Object.values(node.constraints) });
      }
      if (node.children && node.children.length > 0) {
        walk(node.children, field);
      }
    }
  };
  walk(errors, '');
  return result;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = statusTextFor(HttpStatus.INTERNAL_SERVER_ERROR);
    let code: string = ErrorCode.INTERNAL_ERROR;
    let details: FieldErrors[] | undefined;
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        if (Array.isArray(record.message)) {
          message = record.message.map((entry) => String(entry));
        } else if (typeof record.message === 'string') {
          message = record.message;
        } else {
          message = exception.message;
        }
        error = typeof record.error === 'string' ? record.error : statusTextFor(statusCode);
        code = typeof record.code === 'string' ? record.code : errorCodeFor(statusCode);
      }

      if (exception instanceof ValidationException) {
        details = formatValidationErrors(exception.validationErrors);
        code = ErrorCode.VALIDATION_ERROR;
      }

      if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        if (isProduction) {
          message = 'Internal server error';
        } else {
          stack = exception.stack;
        }
      }
    } else if (exception instanceof Error) {
      if (!isProduction) {
        message = exception.message;
        stack = exception.stack;
      }
    } else if (exception !== null && exception !== undefined && !isProduction) {
      message = String(exception);
    }

    const requestWithId = request as unknown as { requestId?: string };
    const requestId =
      requestWithId.requestId || (request.headers?.['x-request-id'] as string | undefined) || randomUUID();
    const path = request.originalUrl || request.url;
    const logLine = `${request.method} ${path} ${statusCode}`;

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logLine, stack);
    } else {
      this.logger.warn(logLine);
    }

    if (stack) {
      response.locals.errorStack = stack;
    }

    const body: ErrorResponse = {
      statusCode,
      message,
      error,
      code,
      timestamp: new Date().toISOString(),
      path,
      requestId,
      ...(details ? { details } : {}),
      ...(stack ? { stack } : {}),
    };

    response.status(statusCode).json(body);
  }
}
