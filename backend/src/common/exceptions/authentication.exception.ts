import { UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes';

export class AuthenticationException extends UnauthorizedException {
  constructor(message = 'Authentication failed') {
    super({
      statusCode: 401,
      message,
      error: 'Unauthorized',
      code: ErrorCode.UNAUTHORIZED,
    });
  }
}
