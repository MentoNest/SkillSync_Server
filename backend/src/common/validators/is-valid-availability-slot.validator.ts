import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * #1006: Cross-field business-rule validator for availability slots.
 * Decorate the `endTime` field with this; it reads the sibling `startTime`
 * off the DTO instance and ensures both are well-formed "HH:MM" and that
 * startTime precedes endTime. Skips the check when either side is absent so
 * it composes with @IsOptional() on partial/update DTOs.
 */
@ValidatorConstraint({ name: 'IsValidAvailabilitySlot', async: false })
export class IsValidAvailabilitySlotConstraint
  implements ValidatorConstraintInterface
{
  validate(endTime: unknown, args: ValidationArguments): boolean {
    const startTime = (args.object as Record<string, unknown>).startTime;
    if (startTime === undefined || endTime === undefined) return true;
    if (typeof startTime !== 'string' || typeof endTime !== 'string') return false;
    if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) return false;
    return startTime < endTime;
  }

  defaultMessage(): string {
    return 'startTime and endTime must be valid HH:MM times, with startTime before endTime';
  }
}

export function IsValidAvailabilitySlot(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidAvailabilitySlotConstraint,
    });
  };
}
