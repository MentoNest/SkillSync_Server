import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Supported duration units
 */
export enum DurationUnit {
  MINUTES = 'minutes',
  HOURS = 'hours',
}

/**
 * Interface for duration validation options
 */
export interface DurationValidationOptions {
  min?: number;
  max?: number;
  unit: DurationUnit;
}

/**
 * Custom constraint for validating duration values
 */
@ValidatorConstraint({ name: 'isValidDuration', async: false })
export class IsValidDurationConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments): boolean {
    if (typeof value !== 'number' || isNaN(value)) {
      return false;
    }

    const constraints = this.getConstraints(args);
    if (!constraints) {
      return true; // Skip validation if no constraints provided
    }

    const { min, max } = constraints;

    // Check minimum value
    if (min !== undefined && value < min) {
      return false;
    }

    // Check maximum value
    if (max !== undefined && value > max) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const constraints = this.getConstraints(args);
    if (!constraints) {
      return 'Invalid duration value';
    }

    const { min, max, unit } = constraints;
    const messages: string[] = [];

    if (min !== undefined && max !== undefined) {
      messages.push(`Duration must be between ${min} and ${max} ${unit}`);
    } else if (min !== undefined) {
      messages.push(`Duration must be at least ${min} ${unit}`);
    } else if (max !== undefined) {
      messages.push(`Duration must be at most ${max} ${unit}`);
    } else {
      messages.push('Invalid duration value');
    }

    return messages.join('. ');
  }

  private getConstraints(args: ValidationArguments): DurationValidationOptions | null {
    // Constraints are passed via the decorator options
    const [options] = args.constraints as [DurationValidationOptions?];
    return options || null;
  }
}

/**
 * Decorator for validating duration values with min/max limits and units
 * 
 * @param options Validation options including min, max, and unit
 * @param validationOptions Additional validation options
 * 
 * @example
 * @IsValidDuration({ min: 15, max: 480, unit: DurationUnit.MINUTES })
 * duration: number;
 * 
 * @example
 * @IsValidDuration({ min: 0.5, max: 8, unit: DurationUnit.HOURS })
 * sessionDuration: number;
 */
export function IsValidDuration(
  options: DurationValidationOptions,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidDuration',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [options],
      options: validationOptions,
      validator: IsValidDurationConstraint,
    });
  };
}
