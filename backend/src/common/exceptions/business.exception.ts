import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes.enum';

/**
 * Base class for domain-specific exceptions (#1144) that need to carry a
 * stable, frontend-facing error code alongside the usual HTTP status and
 * message. Extends Nest's built-in `HttpException`, so it's picked up by
 * `GlobalExceptionFilter` exactly like `BadRequestException`/`NotFoundException`
 * etc. are.
 */
export class BusinessException extends HttpException {
  public readonly errorCode: ErrorCode;

  constructor(
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode = ErrorCode.BAD_REQUEST,
  ) {
    super({ message, error: errorCode }, status);
    this.errorCode = errorCode;
  }
}

export class ResourceNotFoundException extends BusinessException {
  constructor(resource: string, identifier?: string | number) {
    super(
      identifier
        ? `${resource} with id "${identifier}" was not found`
        : `${resource} was not found`,
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
    );
  }
}

export class ResourceConflictException extends BusinessException {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT);
  }
}
