import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: any = {
      statusCode: status,
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      errorResponse = {
        statusCode: status,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        error: res['error'] ?? exception.name,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        message: res['message'] ?? exception.message,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        details: res['details'],
        path: request.url,
        timestamp: new Date().toISOString(),
      };
    }

    response.status(status).json(errorResponse);
  }
}
