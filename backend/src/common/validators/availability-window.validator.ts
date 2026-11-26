import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import {
  isEndAfterStart,
  TIME_HHMM_REGEX,
} from '../../availability/availability.utils';

/** Cross-field validator for HH:mm availability windows. */
export function IsAvailabilityWindow(
  startProperty: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isAvailabilityWindow',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      constraints: [startProperty],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string' || !TIME_HHMM_REGEX.test(value))
            return true;
          const [related] = args.constraints as [string];
          const start = (args.object as Record<string, unknown>)[related];
          if (typeof start !== 'string' || !TIME_HHMM_REGEX.test(start))
            return true;
          return isEndAfterStart(start, value);
        },
        defaultMessage(args: ValidationArguments): string {
          const [related] = args.constraints as [string];
          return `${args.property} must be later than ${related}`;
        },
      },
    });
  };
}
