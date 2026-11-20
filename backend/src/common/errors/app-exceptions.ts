import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface FieldError {
  field: string;
  errors: string[];
}

/** Custom exceptions extend the NestJS ones and carry a stable error `code`. */
export class ResourceNotFoundException extends NotFoundException {
  constructor(resource: string, id?: string) {
    super({
      message: id ? `${resource} "${id}" was not found` : `${resource} was not found`,
      error: 'Not Found',
      code: ErrorCode.NOT_FOUND,
    });
  }
}

export class DuplicateResourceException extends ConflictException {
  constructor(message: string) {
    super({ message, error: 'Conflict', code: ErrorCode.CONFLICT });
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor(message = 'Invalid credentials') {
    super({ message, error: 'Unauthorized', code: ErrorCode.INVALID_CREDENTIALS });
  }
}

export class TokenExpiredException extends UnauthorizedException {
  constructor(message = 'Token has expired') {
    super({ message, error: 'Unauthorized', code: ErrorCode.TOKEN_EXPIRED });
  }
}

export class BusinessRuleException extends UnprocessableEntityException {
  constructor(message: string, code: ErrorCode = ErrorCode.UNPROCESSABLE) {
    super({ message, error: 'Unprocessable Entity', code });
  }
}

/** Thrown by the validation pipe; carries the per-field messages. */
export class ValidationFailedException extends BadRequestException {
  constructor(public readonly fieldErrors: FieldError[]) {
    super({
      message: 'Validation failed',
      error: 'Bad Request',
      code: ErrorCode.VALIDATION_FAILED,
      errors: fieldErrors,
    });
  }
}
