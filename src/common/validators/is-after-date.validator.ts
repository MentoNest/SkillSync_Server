import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsAfterDate', async: false })
export class IsAfterDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [referenceProperty] = args.constraints as [string];
    const object = args.object as Record<string, unknown>;
    const referenceDate = object[referenceProperty];

    if (!value || !referenceDate) return true; // let @IsDate handle presence

    const valueDate = new Date(value as string);
    const refDate = new Date(referenceDate as string);

    if (isNaN(valueDate.getTime()) || isNaN(refDate.getTime())) return false;

    return valueDate > refDate;
  }

  defaultMessage(args: ValidationArguments): string {
    const [referenceProperty] = args.constraints as [string];
    return `$property must be after ${referenceProperty}`;
  }
}

/**
 * Validates that a date field comes after another date field on the same DTO.
 *
 * @param property  - the property name to compare against
 *
 * @example
 * class Dto {
 *   @IsDateString()
 *   startDate: string;
 *
 *   @IsDateString()
 *   @IsAfterDate('startDate')
 *   endDate: string;
 * }
 */
export function IsAfterDate(property: string, options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsAfterDate',
      target: object.constructor,
      propertyName,
      options,
      constraints: [property],
      validator: IsAfterDateConstraint,
    });
  };
}
