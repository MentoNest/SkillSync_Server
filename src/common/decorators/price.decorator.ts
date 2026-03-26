import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

export interface PriceValidationOptions {
  min?: number;
  max?: number;
}

@ValidatorConstraint({ name: 'isValidPrice', async: false })
export class IsValidPriceConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments): boolean {
    if (typeof value !== 'number' || isNaN(value) || value < 0) return false;

    const [options] = args.constraints as [PriceValidationOptions?];
    if (!options) return true;

    const { min, max } = options;
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const [options] = args.constraints as [PriceValidationOptions?];
    const { min, max } = options ?? {};

    if (min !== undefined && max !== undefined)
      return `Price must be between ${min} and ${max}`;
    if (min !== undefined) return `Price must be at least ${min}`;
    if (max !== undefined) return `Price must be at most ${max}`;
    return 'Price must be a non-negative number';
  }
}

export function IsValidPrice(
  options?: PriceValidationOptions,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidPrice',
      target: object.constructor,
      propertyName,
      constraints: [options],
      options: validationOptions,
      validator: IsValidPriceConstraint,
    });
  };
}
