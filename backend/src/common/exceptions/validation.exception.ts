import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ErrorCode } from '../constants/error-codes';

export class ValidationException extends BadRequestException {
  constructor(public readonly validationErrors: ValidationError[]) {
    super({
      statusCode: 400,
      message: 'Validation failed',
      error: 'Bad Request',
      code: ErrorCode.VALIDATION_ERROR,
    });
  }
}
