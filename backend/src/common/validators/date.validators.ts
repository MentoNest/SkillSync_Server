import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Accepts an ISO 8601 date-time with an explicit timezone. */
export function IsIsoDateTime(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isIsoDateTime',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: {
        message: '$property must be an ISO 8601 date-time with a timezone',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !ISO_DATE_TIME.test(value))
            return false;
          return !Number.isNaN(new Date(value).getTime());
        },
      },
    });
  };
}

/** Ensures the decorated date is not earlier than another DTO property. */
export function IsAfterDate(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isAfterDate',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (value === undefined || value === null) return true;
          const [related] = args.constraints as [string];
          const other = (args.object as Record<string, unknown>)[related];
          if (other === undefined || other === null) return true;
          const current = new Date(String(value)).getTime();
          const previous = new Date(String(other)).getTime();
          if (Number.isNaN(current) || Number.isNaN(previous)) return true;
          return current >= previous;
        },
        defaultMessage(args: ValidationArguments): string {
          const [related] = args.constraints as [string];
          return `${args.property} must be after ${related}`;
        },
      },
    });
  };
}
