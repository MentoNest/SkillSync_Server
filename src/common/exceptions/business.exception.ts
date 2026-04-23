import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes } from './error-codes.enum';

export interface BusinessErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  errorCode: ErrorCodes;
  timestamp: string;
  path: string;
  requestId?: string;
}

export class BusinessException extends HttpException {
  private readonly errorCode: ErrorCodes;

  constructor(
    message: string | string[],
    errorCode: ErrorCodes,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ message, errorCode }, statusCode);
    this.errorCode = errorCode;
    this.name = 'BusinessException';
  }

  getErrorCode(): ErrorCodes {
    return this.errorCode;
  }
}
