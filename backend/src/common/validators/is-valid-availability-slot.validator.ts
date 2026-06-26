import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** ISO 8601 time string in HH:MM format */
const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Valid day-of-week values */
const VALID_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export interface AvailabilitySlot {
  day: string;
  startTime: string;
  endTime: string;
}

function isValidSlot(slot: unknown): slot is AvailabilitySlot {
  if (typeof slot !== 'object' || slot === null) return false;

  const s = slot as Record<string, unknown>;

  if (typeof s.day !== 'string' || !VALID_DAYS.includes(s.day.toLowerCase())) return false;
  if (typeof s.startTime !== 'string' || !TIME_REGEX.test(s.startTime)) return false;
  if (typeof s.endTime !== 'string' || !TIME_REGEX.test(s.endTime)) return false;

  // endTime must be after startTime
  return s.endTime > s.startTime;
}

@ValidatorConstraint({ name: 'IsValidAvailabilitySlot', async: false })
export class IsValidAvailabilitySlotConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.every(isValidSlot);
    }
    return isValidSlot(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return (
      `${args.property} must be a valid availability slot or array of slots. ` +
      'Each slot requires: day (monday–sunday), startTime (HH:MM), endTime (HH:MM) where endTime > startTime'
    );
  }
}

/**
 * Validates that a value is a valid availability slot object or an array of them.
 *
 * @example
 * class UpdateProfileDto {
 *   @IsValidAvailabilitySlot()
 *   availability: { day: string; startTime: string; endTime: string }[];
 * }
 */
export function IsValidAvailabilitySlot(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsValidAvailabilitySlotConstraint,
    });
  };
}
