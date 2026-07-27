import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidIanaTimezone } from '../utils/timezone.utils.js';

/**
 * #1006: Business-rule validator for IANA timezone identifiers
 * (e.g. "America/New_York", "UTC").
 */
@ValidatorConstraint({ name: 'IsValidTimezone', async: false })
export class IsValidTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidIanaTimezone(value);
  }

  defaultMessage(): string {
    return 'timezone must be a valid IANA timezone identifier (e.g. "America/New_York")';
  }
}

export function IsValidTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidTimezoneConstraint,
    });
  };
}
