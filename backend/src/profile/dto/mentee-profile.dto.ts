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
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MenteeProfile, SkillLevel } from '../mentee-profile.entity';

function trimString({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  return typeof input === 'string' ? input.trim() : input;
}

function trimArray({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  if (!Array.isArray(input)) return input;
  return input.map((item: unknown) =>
    typeof item === 'string' ? item.trim() : item,
  );
}

export class CreateMenteeProfileDto {
  @ApiProperty({
    description: 'Learning goals (max 500 characters each).',
    example: [
      'Master distributed systems',
      'Prepare for senior backend interviews',
    ],
    type: [String],
  })
  @Transform(trimArray)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(3, { each: true })
  @MaxLength(500, { each: true })
  learningGoals!: string[];

  @ApiProperty({
    description: 'Areas of interest / topics.',
    example: ['System Design', 'NestJS'],
    type: [String],
  })
  @Transform(trimArray)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  interests!: string[];

  @ApiProperty({
    description: 'Current skill level.',
    enum: SkillLevel,
    example: SkillLevel.INTERMEDIATE,
  })
  @IsEnum(SkillLevel)
  experienceLevel!: SkillLevel;

  @ApiPropertyOptional({
    description: 'Preferred mentoring style tags.',
    example: ['career advice', 'technical skills', 'interview prep'],
    type: [String],
  })
  @Transform(trimArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  preferredMentoringStyle?: string[];

  @ApiPropertyOptional({
    description: 'Weekly time commitment in hours.',
    example: 5,
    minimum: 1,
    maximum: 168,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  timeCommitmentHoursPerWeek?: number | null;

  @ApiPropertyOptional({
    description: 'Professional background summary.',
    maxLength: 2000,
    nullable: true,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  professionalBackground?: string | null;

  @ApiPropertyOptional({
    description: 'Optional current job title.',
    maxLength: 120,
    nullable: true,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string | null;

  @ApiPropertyOptional({
    description: 'Optional industry.',
    maxLength: 120,
    nullable: true,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string | null;

  @ApiPropertyOptional({
    description: 'Optional portfolio links.',
    type: [String],
  })
  @Transform(trimArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_tld: false, require_protocol: true }, { each: true })
  @MaxLength(2048, { each: true })
  portfolioLinks?: string[];

  @ApiPropertyOptional({
    description: 'Maximum monthly budget in USD cents.',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(1_000_000)
  budgetUsdCentsPerMonth?: number | null;

  @ApiPropertyOptional({ description: 'Languages.', type: [String] })
  @Transform(trimArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  languages?: string[];
}

export class UpdateMenteeProfileDto {
  @ApiPropertyOptional({ type: [String] })
  @Transform(trimArray)
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(3, { each: true })
  @MaxLength(500, { each: true })
  learningGoals?: string[];

  @ApiPropertyOptional({ type: [String] })
  @Transform(trimArray)
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  interests?: string[];

  @ApiPropertyOptional({ enum: SkillLevel })
  @IsOptional()
  @IsEnum(SkillLevel)
  experienceLevel?: SkillLevel;

  @ApiPropertyOptional({ type: [String] })
  @Transform(trimArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(64, { each: true })
  preferredMentoringStyle?: string[];

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 168 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  timeCommitmentHoursPerWeek?: number | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  professionalBackground?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @Transform(trimArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_tld: false, require_protocol: true }, { each: true })
  @MaxLength(2048, { each: true })
  portfolioLinks?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(1_000_000)
  budgetUsdCentsPerMonth?: number | null;

  @ApiPropertyOptional({ type: [String] })
  @Transform(trimArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  languages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MenteeProfileWithCompletionDto {
  @ApiProperty({ type: () => MenteeProfile })
  profile!: MenteeProfile;

  @ApiProperty({
    description:
      'Profile completion percentage based on filled fields (0–100 base score).',
    example: 83,
  })
  completionPercentage!: number;

  @ApiProperty({
    description: 'List of missing required field names.',
    type: [String],
  })
  missingFields!: string[];
}
