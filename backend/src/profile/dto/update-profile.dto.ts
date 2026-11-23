import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsValidWalletAddress } from '../../common/validators';
import { EXPERIENCE_LEVELS, ProfileType } from './create-profile.dto';

function trimString({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  return typeof input === 'string' ? input.trim() : input;
}

function trimStringArray({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  if (!Array.isArray(input)) return input;
  const sanitized: unknown[] = [];
  for (const item of input as unknown[]) {
    sanitized.push(typeof item === 'string' ? item.trim() : item);
  }
  return sanitized;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description:
      'Target profile wallet address; admins only. Defaults to the authenticated user.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'walletAddress must be a string.' })
  @IsValidWalletAddress()
  walletAddress?: string;

  @ApiPropertyOptional({ description: 'Mentor biography.', maxLength: 500 })
  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'bio must be a string.' })
  @MinLength(10, { message: 'bio must be at least 10 characters.' })
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'Skills taught by the mentor.',
    type: [String],
  })
  @Transform(trimStringArray)
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayNotEmpty({ message: 'skills must contain at least one entry.' })
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  skills?: string[];

  @ApiPropertyOptional({
    description: 'Mentor areas of expertise.',
    type: [String],
  })
  @Transform(trimStringArray)
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  expertiseAreas?: string[];

  @ApiPropertyOptional({
    description: 'Hourly rate in USD cents; null clears the rate.',
    nullable: true,
    minimum: 1,
    maximum: 100000,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100_000, {
    message: 'hourlyRateUsdCents must not exceed 100 000 cents ($1 000.00).',
  })
  hourlyRateUsdCents?: number | null;

  @ApiPropertyOptional({
    description: 'Maximum active mentees.',
    minimum: 1,
    maximum: 20,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(20)
  maxMentees?: number;

  @ApiPropertyOptional({
    description: 'Mentee learning goals.',
    maxLength: 500,
  })
  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'learningGoals must be a string.' })
  @MinLength(10, { message: 'learningGoals must be at least 10 characters.' })
  @MaxLength(500)
  learningGoals?: string;

  @ApiPropertyOptional({
    description: 'Topics the mentee wants to focus on.',
    type: [String],
  })
  @Transform(trimStringArray)
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayNotEmpty({ message: 'interests must contain at least one entry.' })
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  interests?: string[];

  @ApiPropertyOptional({
    description: 'Monthly budget in USD cents; null clears the budget.',
    nullable: true,
    minimum: 1,
    maximum: 1000000,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(1_000_000)
  budgetUsdCentsPerMonth?: number | null;

  @ApiPropertyOptional({
    description: 'Mentee self-assessed experience level.',
    enum: EXPERIENCE_LEVELS,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(EXPERIENCE_LEVELS, {
    message:
      'experienceLevel must be one of: beginner, intermediate, advanced.',
  })
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';

  @ApiPropertyOptional({
    description: 'Languages for mentorship sessions.',
    type: [String],
  })
  @Transform(trimStringArray)
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayNotEmpty({ message: 'languages must contain at least one entry.' })
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(32, { each: true })
  languages?: string[];

  @ApiPropertyOptional({
    description: 'Whether the profile is active and visible.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class ProfileTypeParamDto {
  @ApiProperty({ enum: ProfileType })
  @IsEnum(ProfileType, { message: 'type must be "mentor" or "mentee".' })
  type!: ProfileType;
}
