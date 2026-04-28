import { Request } from 'express';
import { ErrorCodes } from '../exceptions/error-codes.enum';

export interface ValidationFieldMessage {
  field: string;
  errors: string[];
}

export type ResponseMessage = string | string[] | ValidationFieldMessage[];

export interface SuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
  requestId?: string;
}

export interface ErrorResponse {
  success: false;
  statusCode: number;
  message: ResponseMessage;
  error: string;
  errorCode?: ErrorCodes;
  timestamp: string;
  path: string;
  requestId?: string;
  stack?: string;
}

export function getRequestId(request: Request): string | undefined {
  return request.headers['x-request-id'] as string | undefined;
}

export function getRequestPath(request: Request): string {
  return request.originalUrl || request.url;
}

export function buildSuccessResponse<T>(
  request: Request,
  statusCode: number,
  message: string,
  data: T,
): SuccessResponse<T> {
  return {
    success: true,
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
    path: getRequestPath(request),
    requestId: getRequestId(request),
  };
}

export function buildErrorResponse(
  request: Request,
  payload: {
    statusCode: number;
    error: string;
    message: ResponseMessage;
    errorCode?: ErrorCodes;
    stack?: string;
  },
): ErrorResponse {
  return {
    success: false,
    statusCode: payload.statusCode,
    message: payload.message,
    error: payload.error,
    errorCode: payload.errorCode,
    timestamp: new Date().toISOString(),
    path: getRequestPath(request),
    requestId: getRequestId(request),
    stack: payload.stack,
  };
}
