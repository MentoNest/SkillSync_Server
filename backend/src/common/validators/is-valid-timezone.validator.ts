import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

// List of all valid IANA timezones
const VALID_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

@ValidatorConstraint({ name: 'isValidTimezone', async: false })
export class IsValidTimezoneConstraint implements ValidatorConstraintInterface {
  validate(timezone: string, args: ValidationArguments) {
    if (!timezone) return false;
    return VALID_TIMEZONES.has(timezone);
  }

  defaultMessage(args: ValidationArguments) {
    return 'timezone ($value) must be a valid IANA timezone identifier (e.g., "America/New_York", "UTC")';
  }
}

export function IsValidTimezone(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidTimezoneConstraint,
    });
  };
}