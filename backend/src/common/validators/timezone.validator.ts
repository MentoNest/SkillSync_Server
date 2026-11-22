import { registerDecorator, ValidationOptions } from 'class-validator';

/** Validates IANA timezone names using the runtime's ICU data. */
export function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isIanaTimezone',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: {
        message: '$property must be a valid IANA timezone (e.g. "UTC", "Africa/Lagos")',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value.length === 0) return false;
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}
