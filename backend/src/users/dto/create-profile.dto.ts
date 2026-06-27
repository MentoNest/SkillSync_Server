import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsValidAvailabilitySlot, IsValidTimezone } from '../../common/validators';

/** A single weekly availability slot */
export class AvailabilitySlotDto {
  @ApiProperty({ description: 'Day of the week', enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] })
  @IsString()
  @IsNotEmpty()
  day: string;

  @ApiProperty({ description: 'Slot start time in HH:MM format', example: '09:00' })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({ description: 'Slot end time in HH:MM format, must be after startTime', example: '17:00' })
  @IsString()
  @IsNotEmpty()
  endTime: string;
}

export class CreateProfileDto {
  @ApiProperty({ enum: ['mentor', 'mentee'], description: 'Type of profile to create' })
  @IsEnum(['mentor', 'mentee'], { message: 'profileType must be mentor or mentee' })
  profileType: 'mentor' | 'mentee';

  @ApiPropertyOptional({ description: 'Short biography', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'bio must not exceed 500 characters' })
  bio?: string;

  @ApiPropertyOptional({ type: [String], description: 'List of skills (max 20)', maxItems: 20 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'each skill must be a string' })
  @ArrayMaxSize(20, { message: 'skills must not contain more than 20 items' })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Hourly rate in USD (mentors only)', minimum: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'hourlyRate must be a number' })
  @IsPositive({ message: 'hourlyRate must be a positive number' })
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({ type: [String], description: 'Learning goals (mentees only, max 10)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'each learning goal must be a string' })
  @ArrayMaxSize(10, { message: 'learningGoals must not contain more than 10 items' })
  learningGoals?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Areas of interest (max 10)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'each area of interest must be a string' })
  @ArrayMaxSize(10, { message: 'areasOfInterest must not contain more than 10 items' })
  areasOfInterest?: string[];

  @ApiPropertyOptional({ description: 'IANA timezone identifier', example: 'America/New_York' })
  @IsOptional()
  @IsString()
  @IsValidTimezone({ message: 'timezone must be a valid IANA timezone identifier' })
  timezone?: string;

  @ApiPropertyOptional({ type: [AvailabilitySlotDto], description: 'Weekly availability slots (max 14)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(14, { message: 'availability must not exceed 14 slots (2 per day)' })
  @Type(() => AvailabilitySlotDto)
  @IsValidAvailabilitySlot({ message: 'each availability slot must have a valid day, startTime, and endTime' })
  availability?: AvailabilitySlotDto[];
}
