import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import {
  isEndAfterStart,
  isValidTimezone,
  TIME_HHMM_REGEX,
} from '../availability.utils';

function IsValidTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidTimezone',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isValidTimezone(value);
        },
        defaultMessage() {
          return 'timezone must be a valid IANA timezone (e.g. "UTC", "Africa/Lagos").';
        },
      },
    });
  };
}

function IsEndAfterStartProperty(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isEndAfterStartProperty',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          const related = (args.object as Record<string, unknown>)[relatedPropertyName];
          if (typeof value !== 'string' || typeof related !== 'string') return true;
          if (!TIME_HHMM_REGEX.test(value) || !TIME_HHMM_REGEX.test(related)) return true;
          return isEndAfterStart(related, value);
        },
        defaultMessage() {
          return 'endTimeUtc must be after startTimeUtc.';
        },
      },
    });
  };
}

export class CreateAvailabilitySlotDto {
  @ApiProperty({ description: 'Day of week (0=Sunday ... 6=Saturday).', example: 1, minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ description: 'Start time in UTC (HH:mm).', example: '10:00' })
  @IsString()
  @Matches(TIME_HHMM_REGEX, { message: 'startTimeUtc must be in HH:mm 24-hour format.' })
  startTimeUtc!: string;

  @ApiProperty({ description: 'End time in UTC (HH:mm), must be after startTimeUtc.', example: '12:00' })
  @IsString()
  @Matches(TIME_HHMM_REGEX, { message: 'endTimeUtc must be in HH:mm 24-hour format.' })
  @IsEndAfterStartProperty('startTimeUtc')
  endTimeUtc!: string;

  @ApiPropertyOptional({ description: 'IANA timezone for display/conversion.', example: 'UTC', default: 'UTC' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @IsValidTimezone()
  timezone?: string;
}

export class UpdateAvailabilitySlotDto {
  @ApiPropertyOptional({ description: 'Day of week (0=Sunday ... 6=Saturday).', example: 1, minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ description: 'Start time in UTC (HH:mm).', example: '10:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_HHMM_REGEX, { message: 'startTimeUtc must be in HH:mm 24-hour format.' })
  startTimeUtc?: string;

  @ApiPropertyOptional({ description: 'End time in UTC (HH:mm), must be after startTimeUtc.', example: '12:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_HHMM_REGEX, { message: 'endTimeUtc must be in HH:mm 24-hour format.' })
  endTimeUtc?: string;

  @ApiPropertyOptional({ description: 'IANA timezone for display/conversion.', example: 'UTC' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @IsValidTimezone()
  timezone?: string;
}
