import { ValidationPipe } from '@nestjs/common';
import { ValidationException } from '../exceptions/validation.exception';

export function createAppValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationException(errors),
  });
}
