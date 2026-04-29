import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCodes } from '../exceptions/error-codes.enum';
import {
  buildErrorResponse,
  ErrorResponse,
  ValidationFieldMessage,
} from '../utils/api-response.util';
import { RequestContextService } from '../services/request-context.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly requestContextService = new RequestContextService();

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProduction = process.env.NODE_ENV === 'production';
    const requestId = this.requestContextService.getRequestId();

    let errorResponse: ErrorResponse;

    if (exception instanceof BusinessException) {
      // Handle custom business exceptions
      errorResponse = this.handleBusinessException(exception, request);
    } else if (exception instanceof HttpException) {
      // Handle NestJS HTTP exceptions
      errorResponse = this.handleHttpException(exception, request);
    } else {
      // Handle unknown exceptions
      errorResponse = this.handleUnknownException(exception, request);
    }

    // Add stack trace only in non-production
    if (!isProduction && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    // Log the error
    this.logError(exception, errorResponse, request);

    // Attach raw error to request for the logger middleware to capture stack trace
    (request as any).rawError = exception;

    // Send response
    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private handleBusinessException(
    exception: BusinessException,
    request: Request,
  ): ErrorResponse {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    return buildErrorResponse(request, {
      statusCode: status,
      message: exceptionResponse.message || exception.message,
      error: exception.name,
      errorCode: exception.getErrorCode(),
    });
  }

  private handleHttpException(
    exception: HttpException,
    request: Request,
  ): ErrorResponse {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    let message = exceptionResponse.message || exception.message;

    // Format validation errors
    if (Array.isArray(exceptionResponse.message)) {
      message = this.formatValidationErrors(exceptionResponse.message);
    }

    return buildErrorResponse(request, {
      statusCode: status,
      message,
      error: exceptionResponse.error || this.getErrorName(status),
      errorCode: this.mapStatusCodeToErrorCode(status),
    });
  }

  private handleUnknownException(
    exception: unknown,
    request: Request,
  ): ErrorResponse {
    this.logger.error('Unhandled exception caught', exception);

    return buildErrorResponse(request, {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
      errorCode: ErrorCodes.INTERNAL_ERROR,
    });
  }

  private formatValidationErrors(errors: string[]): ValidationFieldMessage[] {
    return errors.map((error) => {
      // Expected format: "property should not be null" or "property must be an email"
      const match = error.match(/^(\w+)\s+(.+)$/);
      if (match) {
        return {
          field: match[1],
          errors: [match[2]],
        };
      }
      return {
        field: 'unknown',
        errors: [error],
      };
    });
  }

  private mapStatusCodeToErrorCode(status: number): ErrorCodes {
    const errorMap: Record<number, ErrorCodes> = {
      [HttpStatus.BAD_REQUEST]: ErrorCodes.BAD_REQUEST,
      [HttpStatus.UNAUTHORIZED]: ErrorCodes.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ErrorCodes.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCodes.NOT_FOUND,
      [HttpStatus.CONFLICT]: ErrorCodes.CONFLICT,
      [HttpStatus.TOO_MANY_REQUESTS]: ErrorCodes.RATE_LIMIT_EXCEEDED,
      [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCodes.INTERNAL_ERROR,
    };

    return errorMap[status] || ErrorCodes.INTERNAL_ERROR;
  }

  private getErrorName(status: number): string {
    const errorNames: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
    };

    return errorNames[status] || 'Error';
  }

  private logError(
    exception: unknown,
    errorResponse: ErrorResponse,
    request: Request,
  ): void {
    const { statusCode, message, path } = errorResponse;
    const requestId = this.requestContextService.getRequestId();
    const context = requestId ? `[${requestId}]` : '';

    if (statusCode >= 500) {
      this.logger.error(
        `Internal Server Error: ${message} ${context}`,
        exception instanceof Error ? exception.stack : '',
        `${request.method} ${path}`,
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        `Client Error: ${message} ${context}`,
        `${request.method} ${path}`,
      );
    }
  }
}
