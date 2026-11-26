import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidTimezone } from '../utils/timezone.utils';

/** Validates IANA timezone names using the runtime's ICU data. */
export function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isIanaTimezone',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: {
        message:
          '$property must be a valid IANA timezone (e.g. "UTC", "Africa/Lagos")',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidTimezone(value);
        },
      },
    });
  };
}
