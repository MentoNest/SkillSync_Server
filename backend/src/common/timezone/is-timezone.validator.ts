import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidTimezone } from './timezone.util';

/** Validates that a property holds an IANA timezone name. */
export function IsTimezone(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isTimezone',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => isValidTimezone(value),
        defaultMessage: () => `${propertyName} must be a valid IANA timezone`,
      },
    });
  };
}
