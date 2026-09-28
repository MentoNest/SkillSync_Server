import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/**
 * #1347: Validates that a Date value is strictly after a reference date.
 * The reference is resolved lazily via a property getter callback so it can
 * compare against sibling fields (e.g. endDate must be after startDate) or
 * against the current time (default behaviour).
 *
 * Usage:
 *   @IsAfterDate()                          // must be after now
 *   @IsAfterDate(() => someFixedDate)       // must be after a fixed Date
 *   @IsAfterDate((obj) => obj.startDate)    // must be after a sibling field
 */
@ValidatorConstraint({ name: 'isAfterDate', async: false })
export class IsAfterDateConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments): boolean {
    if (!(value instanceof Date) || isNaN(value.getTime())) {
      return false;
    }

    const [getReference] = args.constraints as [
      ((obj: any) => Date | undefined) | undefined,
    ];
    const reference: Date =
      typeof getReference === 'function'
        ? (getReference(args.object) ?? new Date())
        : new Date();

    if (!(reference instanceof Date) || isNaN(reference.getTime())) {
      // If the reference cannot be resolved we allow the value through
      return true;
    }

    return value.getTime() > reference.getTime();
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a date after the reference date`;
  }
}

export function IsAfterDate(
  getReference?: (obj: any) => Date | undefined,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [getReference],
      validator: IsAfterDateConstraint,
    });
  };
}
