import { HttpStatus } from '@nestjs/common';
import { AppError } from './app-error';
import { ErrorCodes } from './error-codes.enum';

export class InsufficientBalanceException extends AppError {
  constructor(details?: unknown) {
    super(
      ErrorCodes.INSUFFICIENT_BALANCE,
      'Insufficient balance to complete this operation',
      HttpStatus.PAYMENT_REQUIRED,
      details,
    );
  }
}
