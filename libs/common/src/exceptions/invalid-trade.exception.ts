import { HttpStatus } from '@nestjs/common';
import { AppError } from './app-error';
import { ErrorCodes } from './error-codes.enum';

export class InvalidTradeException extends AppError {
  constructor(details?: unknown) {
    super(
      ErrorCodes.INVALID_TRADE,
      'The trade request is invalid or malformed',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}
