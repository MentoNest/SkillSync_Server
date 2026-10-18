import { ValidationPipe } from '@nestjs/common';
import { ValidationException } from '../exceptions/validation.exception';

/**
 * The single global validation entry point (#1460).
 *
 * Strictness is deliberate:
 * - `whitelist` strips properties that have no decorator, so a caller cannot
 *   smuggle extra fields into a service and have them persisted.
 * - `forbidNonWhitelisted` rejects those requests outright instead of silently
 *   dropping them, so a client bug surfaces as a 400 rather than as data that
 *   mysteriously did not save.
 * - `transform` + `transformOptions.enableImplicitConversion` turn query strings
 *   into the numbers and booleans the DTO types declare.
 *
 * All field errors are reported at once (the class-validator default) so a form
 * can highlight every bad input in one round trip.
 */
export function createAppValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (errors) => new ValidationException(errors),
  });
}