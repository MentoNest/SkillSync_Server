import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';

/**
 * Validates that a property is a date strictly after the current time (#1460).
 *
 * Used for scheduling rules ("sessions must start in the future"). Comparison
 * is inclusive of the millisecond, so `endDate === now` is rejected — callers
 * pass the boundary date they intend as the *exclusive* upper bound.
 */
export function IsAfterDate(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isAfterDate',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown): boolean => {
          const date = toDate(value);
          return date !== null && date.getTime() > Date.now();
        },
        defaultMessage: (args: ValidationArguments): string =>
          `${args.property} must be a date in the future`,
      },
    });
  };
}

/**
 * Validates that a property is at or before `otherProperty` — the companion to
 * {@link IsAfterDate} for ranges such as `endTime` vs `startTime` (#1460).
 */
export function IsAfterProperty(otherProperty: string, options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isAfterProperty',
      target: object.constructor,
      propertyName,
      constraints: [otherProperty],
      options,
      validator: {
        validate: (value: unknown, args: ValidationArguments): boolean => {
          const self = toDate(value);
          const other = toDate((args.object as Record<string, unknown>)?.[otherProperty]);
          if (self === null || other === null) return false;
          return self.getTime() >= other.getTime();
        },
        defaultMessage: (args: ValidationArguments): string =>
          `${args.property} must be the same as or later than ${args.constraints[0]}`,
      },
    });
  };
}

/**
 * Validates a `HH:mm` wall-clock time. Seconds and offsets are rejected because
 * availability slots are stored as 24-hour local time (#1460).
 */
export function IsTimeString(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isTimeString',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown): boolean => {
          if (typeof value !== 'string') return false;
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
          return value !== '00:00';
        },
        defaultMessage: (args: ValidationArguments): string =>
          `${args.property} must be a 24-hour "HH:mm" time between 01:00 and 23:59`,
      },
    });
  };
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}