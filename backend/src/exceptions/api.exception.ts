import { BadRequestException, HttpException, HttpStatus, NotFoundException, UnauthorizedException } from '@nestjs/common';

export class ApiException extends HttpException {
  constructor(response: string | Record<string, any>, status: HttpStatus) {
    super(response, status);
  }
}

export class ApiBadRequestException extends BadRequestException {
  constructor(message: string | Record<string, any>) {
    super({
      message,
      error: 'Bad Request',
      errorCode: 'bad_request',
    });
  }
}

export class ApiNotFoundException extends NotFoundException {
  constructor(message = 'Resource not found') {
    super({
      message,
      error: 'Not Found',
      errorCode: 'not_found',
    });
  }
}

export class ApiUnauthorizedException extends UnauthorizedException {
  constructor(message = 'Unauthorized') {
    super({
      message,
      error: 'Unauthorized',
      errorCode: 'unauthorized',
    });
  }
}
