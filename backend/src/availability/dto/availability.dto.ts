import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsTimezone } from '../../common/timezone/is-timezone.validator';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAvailabilitySlotDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday ... 6 = Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '10:00' })
  @Matches(TIME, { message: 'startTime must be in HH:mm format' })
  startTime!: string;

  @ApiProperty({ example: '12:00' })
  @Matches(TIME, { message: 'endTime must be in HH:mm format' })
  endTime!: string;

  @ApiPropertyOptional({ example: 'America/New_York', default: 'UTC' })
  @IsOptional()
  @IsTimezone()
  timezone?: string;
}

export class UpdateAvailabilitySlotDto extends PartialType(CreateAvailabilitySlotDto) {}

export class CreateAvailabilityExceptionDto {
  @ApiProperty({ example: '2024-12-25', description: 'ISO date (YYYY-MM-DD)' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(TIME, { message: 'startTime must be in HH:mm format' })
  startTime?: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsOptional()
  @Matches(TIME, { message: 'endTime must be in HH:mm format' })
  endTime?: string;

  @ApiPropertyOptional({ example: 'Public holiday', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
