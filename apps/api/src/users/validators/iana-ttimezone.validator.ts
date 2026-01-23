import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export function IsIanaTimezone(
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'IsIanaTimezone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: string) {
          try {
            Intl.DateTimeFormat(undefined, {
              timeZone: value,
            });
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}
