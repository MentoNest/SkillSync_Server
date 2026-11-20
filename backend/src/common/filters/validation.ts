import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { FieldError, ValidationFailedException } from '../errors/app-exceptions';

/**
 * Flattens class-validator errors (including nested objects, with dotted paths) into
 * `{ field, errors: string[] }` entries with the validator's human-readable messages.
 */
export function formatValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      out.push({ field, errors: Object.values(error.constraints) });
    }
    if (error.children?.length) {
      out.push(...formatValidationErrors(error.children, field));
    }
  }
  return out;
}

/** Validation pipe whose failures use the API's `{ field, errors }` shape. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationFailedException(formatValidationErrors(errors)),
  });
}
