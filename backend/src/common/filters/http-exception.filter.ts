import { Catch, ExceptionFilter, HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { Request, Response } from 'express';
import crypto from 'crypto';
import { mapHttpStatusToErrorCode } from '../exceptions/api-exceptions';

function normalizeErrorResponse(response: unknown) {
  if (typeof response === 'string') {
    return {
      message: response,
      error: undefined,
      code: undefined,
      validation: undefined,
      i18n: undefined,
    };
  }

  if (Array.isArray(response)) {
    return {
      message: response,
      error: undefined,
      code: 'validation_error',
      validation: undefined,
      i18n: undefined,
    };
  }

  if (response && typeof response === 'object') {
    return {
      message: (response as Record<string, unknown>).message ?? (response as Record<string, unknown>).error,
      error: (response as Record<string, unknown>).error,
      code: (response as Record<string, unknown>).code,
      validation: (response as Record<string, unknown>).validation,
      i18n: (response as Record<string, unknown>).i18n,
    };
  }

  return {
    message: undefined,
    error: undefined,
    code: undefined,
    validation: undefined,
    i18n: undefined,
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestHeader = request.headers['x-request-id'];
    const responseHeader = response.getHeader('x-request-id');
    const requestId =
      (Array.isArray(requestHeader) ? requestHeader[0] : requestHeader) ||
      (Array.isArray(responseHeader) ? responseHeader[0] : responseHeader) ||
      crypto.randomUUID();
    const path = request.originalUrl || request.url || '';
    const timestamp = new Date().toISOString();

    const isProduction = process.env.NODE_ENV === 'production';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let responseBody: {
      message?: string | string[];
      error?: string;
      code?: string;
      validation?: unknown;
      i18n?: unknown;
    } = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      responseBody = normalizeErrorResponse(exception.getResponse()) as {
        message?: string | string[];
        error?: string;
        code?: string;
        validation?: unknown;
        i18n?: unknown;
      };
    } else if (exception instanceof Error) {
      responseBody = {
        message: exception.message,
        error: exception.name,
      };
    }

    const message =
      responseBody.message ?? HttpStatus[status] ?? 'Unexpected error';
    const error = responseBody.error ?? HttpStatus[status] ?? 'Error';
    const code =
      responseBody.code ?? mapHttpStatusToErrorCode(status, error.toString());

    const payload: Record<string, unknown> = {
      statusCode: status,
      message,
      error,
      code,
      timestamp,
      path,
      requestId,
    };

    if (responseBody.validation) {
      payload.validation = responseBody.validation;
    }

    if (responseBody.i18n) {
      payload.i18n = responseBody.i18n;
    }

    if (!isProduction && exception instanceof Error && exception.stack) {
      payload.stack = exception.stack;
    }

    (response as unknown as { locals?: Record<string, unknown> }).locals =
      (response as unknown as { locals?: Record<string, unknown> }).locals ?? {};
    (response as unknown as { locals?: Record<string, unknown> }).locals!.error =
      exception;

    response.status(status).json(payload);
  }
}
