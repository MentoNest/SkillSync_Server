import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsValidTimezone', async: false })
export class IsValidTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
      // Intl.DateTimeFormat throws a RangeError for unknown timezone identifiers
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid IANA timezone identifier (e.g., "America/New_York", "UTC")`;
  }
}

/**
 * Validates that a string is a valid IANA timezone identifier.
 *
 * @example
 * class UpdateProfileDto {
 *   @IsValidTimezone()
 *   timezone: string; // "America/New_York", "Europe/London", "UTC"
 * }
 */
export function IsValidTimezone(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsValidTimezoneConstraint,
    });
  };
}
