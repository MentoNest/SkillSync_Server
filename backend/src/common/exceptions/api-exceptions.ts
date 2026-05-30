import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { formatValidationErrors } from '../utils/validation.util';

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'internal_server_error'
  | 'conflict'
  | 'too_many_requests'
  | string;

const ERROR_CODE_MAP: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'bad_request',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'too_many_requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'internal_server_error',
};

export function mapHttpStatusToErrorCode(
  statusCode: number,
  fallback?: string,
): ErrorCode {
  if (ERROR_CODE_MAP[statusCode]) {
    return ERROR_CODE_MAP[statusCode];
  }

  if (fallback) {
    return fallback
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  return 'internal_server_error';
}

export class ApiBadRequestException extends BadRequestException {
  constructor(message: string | object, code?: ErrorCode) {
    super({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message,
      code: code ?? 'bad_request',
    });
  }
}

export class ApiUnauthorizedException extends UnauthorizedException {
  constructor(message: string | object, code?: ErrorCode) {
    super({
      statusCode: HttpStatus.UNAUTHORIZED,
      error: 'Unauthorized',
      message,
      code: code ?? 'unauthorized',
    });
  }
}

export class ApiNotFoundException extends NotFoundException {
  constructor(message: string | object, code?: ErrorCode) {
    super({
      statusCode: HttpStatus.NOT_FOUND,
      error: 'Not Found',
      message,
      code: code ?? 'not_found',
    });
  }
}

export class ApiValidationException extends BadRequestException {
  constructor(errors: ValidationError[], message = 'Validation failed') {
    super({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message,
      code: 'validation_error',
      validation: formatValidationErrors(errors),
    });
  }
}
