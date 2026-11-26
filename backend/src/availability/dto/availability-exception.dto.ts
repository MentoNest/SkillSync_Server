import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import {
  DATE_YYYY_MM_DD_REGEX,
  isEndAfterStart,
  TIME_HHMM_REGEX,
} from '../availability.utils';

function IsEndAfterStartProperty(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isEndAfterStartPropertyException',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          const related = (args.object as Record<string, unknown>)[
            relatedPropertyName
          ];
          if (typeof value !== 'string' || typeof related !== 'string')
            return true;
          if (!TIME_HHMM_REGEX.test(value) || !TIME_HHMM_REGEX.test(related))
            return true;
          return isEndAfterStart(related, value);
        },
        defaultMessage() {
          return 'endTimeUtc must be after startTimeUtc.';
        },
      },
    });
  };
}

export class CreateAvailabilityExceptionDto {
  @ApiProperty({
    description: 'Date of exception in YYYY-MM-DD (UTC date).',
    example: '2026-12-25',
  })
  @IsString()
  @Matches(DATE_YYYY_MM_DD_REGEX, {
    message: 'date must be in YYYY-MM-DD format.',
  })
  date!: string;

  @ApiProperty({
    description: 'Exception start time in UTC (HH:mm).',
    example: '00:00',
  })
  @IsString()
  @Matches(TIME_HHMM_REGEX, {
    message: 'startTimeUtc must be in HH:mm 24-hour format.',
  })
  startTimeUtc!: string;

  @ApiProperty({
    description: 'Exception end time in UTC (HH:mm).',
    example: '23:59',
  })
  @IsString()
  @Matches(TIME_HHMM_REGEX, {
    message: 'endTimeUtc must be in HH:mm 24-hour format.',
  })
  @IsEndAfterStartProperty('startTimeUtc')
  endTimeUtc!: string;

  @ApiPropertyOptional({
    description: 'Reason for exception.',
    example: 'Holiday',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string | null;

  @ApiPropertyOptional({
    description:
      'When true, this window marks mentor unavailable and overrides weekly slots.',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isUnavailable?: boolean;
}

export class UpdateAvailabilityExceptionDto {
  @ApiPropertyOptional({
    description: 'Date of exception in YYYY-MM-DD (UTC date).',
    example: '2026-12-25',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_YYYY_MM_DD_REGEX, {
    message: 'date must be in YYYY-MM-DD format.',
  })
  date?: string;

  @ApiPropertyOptional({
    description: 'Exception start time in UTC (HH:mm).',
    example: '00:00',
  })
  @IsOptional()
  @IsString()
  @Matches(TIME_HHMM_REGEX, {
    message: 'startTimeUtc must be in HH:mm 24-hour format.',
  })
  startTimeUtc?: string;

  @ApiPropertyOptional({
    description: 'Exception end time in UTC (HH:mm).',
    example: '23:59',
  })
  @IsOptional()
  @IsString()
  @Matches(TIME_HHMM_REGEX, {
    message: 'endTimeUtc must be in HH:mm 24-hour format.',
  })
  endTimeUtc?: string;

  @ApiPropertyOptional({
    description: 'Reason for exception.',
    example: 'Holiday',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string | null;

  @ApiPropertyOptional({
    description: 'Marks window unavailable when true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isUnavailable?: boolean;
}
