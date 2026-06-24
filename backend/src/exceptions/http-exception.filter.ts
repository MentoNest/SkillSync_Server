import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { ValidationError } from 'class-validator';

interface FieldError {
  field: string;
  errors: string[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getStatus(exception);
    const errorResponse = this.mapException(exception, request, status);

    if (status >= 500) {
      this.logger.error(JSON.stringify({
        requestId: request.headers['x-request-id'] || null,
        status,
        path: request.url,
        message: errorResponse.message,
        stack: exception instanceof Error ? exception.stack : null,
      }));
    }

    response.status(status).json(errorResponse);
  }

  private getStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private mapException(exception: unknown, request: Request, status: number) {
    const timestamp = new Date().toISOString();
    const path = request.url;
    const requestId = request.headers['x-request-id'] || null;
    const isProd = process.env.NODE_ENV === 'production';

    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return {
          statusCode: status,
          message: response,
          error: exception.name,
          code: this.mapErrorCode(status),
          timestamp,
          path,
          requestId,
          ...(exception instanceof Error && !isProd ? { stack: exception.stack } : {}),
        };
      }

      const payload = response as any;
      const validation = this.extractValidationErrors(payload);

      return {
        statusCode: status,
        message: payload.message || payload.error || exception.name,
        error: payload.error || exception.name,
        code: payload.errorCode || this.mapErrorCode(status),
        timestamp,
        path,
        requestId,
        ...(validation ? { validation } : {}),
        ...(!isProd && exception instanceof Error ? { stack: exception.stack } : {}),
      };
    }

    return {
      statusCode: status,
      message: 'Internal server error',
      error: 'Internal Server Error',
      code: 'internal_server_error',
      timestamp,
      path,
      requestId,
      ...(exception instanceof Error && !isProd ? { stack: exception.stack } : {}),
    };
  }

  private mapErrorCode(status: number) {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'bad_request';
      case HttpStatus.UNAUTHORIZED:
        return 'unauthorized';
      case HttpStatus.NOT_FOUND:
        return 'not_found';
      case HttpStatus.FORBIDDEN:
        return 'forbidden';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'rate_limited';
      default:
        return 'internal_server_error';
    }
  }

  private extractValidationErrors(payload: any): FieldError[] | null {
    const errors = payload.message || payload?.message;
    if (!Array.isArray(payload?.message) && !Array.isArray(errors)) {
      return null;
    }

    const validationErrors = Array.isArray(payload.message) ? payload.message : [];

    return validationErrors.reduce((result: FieldError[], error: any) => {
      if (error.property && Array.isArray(error.constraints)) {
        result.push({ field: error.property, errors: Object.values(error.constraints) });
        return result;
      }

      const children = error.children;
      if (children && children.length) {
        const childErrors = this.flattenChildren(error.property, children);
        return result.concat(childErrors);
      }

      return result;
    }, []);
  }

  private flattenChildren(parent: string, children: ValidationError[]): FieldError[] {
    return children.flatMap((child) => {
      const field = `${parent}.${child.property}`;
      const errors = child.constraints ? Object.values(child.constraints) : [];

      return [{ field, errors }].concat(
        child.children ? this.flattenChildren(field, child.children) : [],
      );
    });
  }
}
