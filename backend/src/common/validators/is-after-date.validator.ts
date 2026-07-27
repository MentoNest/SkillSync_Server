import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * #1006: Cross-field business-rule validator. Ensures the decorated property
 * is chronologically after another property on the same DTO. Both values are
 * optional — the check is skipped unless both are present, so it composes
 * cleanly with @IsOptional() on either field.
 */
@ValidatorConstraint({ name: 'IsAfterDate', async: false })
export class IsAfterDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [relatedPropertyName] = args.constraints as [string];
    const relatedValue = (args.object as Record<string, unknown>)[
      relatedPropertyName
    ];

    if (value === undefined || value === null) return true;
    if (relatedValue === undefined || relatedValue === null) return true;

    const current = new Date(value as string | number | Date);
    const related = new Date(relatedValue as string | number | Date);
    if (isNaN(current.getTime()) || isNaN(related.getTime())) return false;

    return current.getTime() > related.getTime();
  }

  defaultMessage(args: ValidationArguments): string {
    const [relatedPropertyName] = args.constraints as [string];
    return `${args.property} must be a date after ${relatedPropertyName}`;
  }
}

export function IsAfterDate(
  relatedPropertyName: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [relatedPropertyName],
      validator: IsAfterDateConstraint,
    });
  };
}
