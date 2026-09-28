import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

@ValidatorConstraint({ name: 'isValidAvailabilitySlot', async: false })
export class IsValidAvailabilitySlotConstraint implements ValidatorConstraintInterface {
  validate(slot: AvailabilitySlot, args: ValidationArguments) {
    if (!slot) return false;
    
    // Validate dayOfWeek is between 0 and 6
    if (typeof slot.dayOfWeek !== 'number' || slot.dayOfWeek < 0 || slot.dayOfWeek > 6) {
      return false;
    }

    // Validate time format HH:mm
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
      return false;
    }

    // Validate end time is after start time
    const [startHour, startMin] = slot.startTime.split(':').map(Number);
    const [endHour, endMin] = slot.endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return endMinutes > startMinutes;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Invalid availability slot: dayOfWeek must be 0-6, times must be in HH:mm format, and endTime must be after startTime';
  }
}

export function IsValidAvailabilitySlot(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidAvailabilitySlotConstraint,
    });
  };
}