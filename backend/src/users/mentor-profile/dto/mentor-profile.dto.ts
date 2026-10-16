import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_BIO_LENGTH, MAX_HOURLY_RATE, MAX_SKILLS, MIN_HOURLY_RATE } from '../../entities/mentor-profile.entity';

/** Validation for creating/updating a mentor profile. */
export class UpsertMentorProfileDto {
  @ApiPropertyOptional({ maxLength: MAX_BIO_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BIO_LENGTH)
  bio?: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_SKILLS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SKILLS)
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ minimum: MIN_HOURLY_RATE, maximum: MAX_HOURLY_RATE })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_HOURLY_RATE)
  @Max(MAX_HOURLY_RATE)
  hourlyRate?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expertiseAreas?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;
}
