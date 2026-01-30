import { HttpException, HttpStatus } from '@nestjs/common';

export class AppError extends HttpException {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string | string[],
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: unknown,
  ) {
    super({ error: 'AppError', message, code, details }, status);
    this.code = code;
    this.details = details;
  }
}
