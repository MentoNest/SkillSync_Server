import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsAfterDate', async: false })
export class IsAfterDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [relatedPropertyName] = args.constraints as [string];
    const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];

    if (!value || !relatedValue) return true; // let @IsDateString handle null/undefined
    return new Date(value as string) > new Date(relatedValue as string);
  }

  defaultMessage(args: ValidationArguments): string {
    const [relatedPropertyName] = args.constraints as [string];
    return `${args.property} must be after ${relatedPropertyName}`;
  }
}

/**
 * Validates that a date string comes after another property's date value.
 *
 * @param property - The name of the comparison property (e.g., 'startTime')
 *
 * @example
 * class CreateSessionDto {
 *   @IsDateString()
 *   startTime: string;
 *
 *   @IsDateString()
 *   @IsAfterDate('startTime')
 *   endTime: string;
 * }
 */
export function IsAfterDate(property: string, options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [property],
      validator: IsAfterDateConstraint,
    });
  };
}
