import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export interface FieldError {
  field: string;
  errors: string[];
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  const result: FieldError[] = [];
  for (const error of errors) {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    if (error.constraints) {
      result.push({ field, errors: Object.values(error.constraints) });
    }
    if (error.children && error.children.length > 0) {
      result.push(...flattenValidationErrors(error.children, field));
    }
  }
  return result;
}

/**
 * Thrown by the global `ValidationPipe` (see `main.ts`) instead of Nest's
 * default `BadRequestException`, so class-validator failures reach
 * `GlobalExceptionFilter` (#1144) as human-readable, field-specific errors —
 * `{ field: string, errors: string[] }[]` — rather than a flat array of
 * strings.
 */
export class ValidationException extends BadRequestException {
  public readonly fieldErrors: FieldError[];

  constructor(errors: ValidationError[]) {
    const fieldErrors = flattenValidationErrors(errors);
    super({
      message: 'Validation failed',
      error: 'VALIDATION_ERROR',
      fieldErrors,
    });
    this.fieldErrors = fieldErrors;
  }
}
