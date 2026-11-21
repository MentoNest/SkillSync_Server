import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
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

export enum ProfileType {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export const EXPERIENCE_LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];

/** Maximum string array element length to prevent storing arbitrarily long skill names. */
const MAX_TAG_LENGTH = 64;
const MAX_TAGS = 20;

function isMentor(o: CreateProfileDto) {
  return o.profileType === ProfileType.MENTOR;
}
function isMentee(o: CreateProfileDto) {
  return o.profileType === ProfileType.MENTEE;
}

export class CreateProfileDto {
  // ─── Discriminator ────────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Which profile type to create. A user may hold at most one of each type.',
    enum: ProfileType,
    example: ProfileType.MENTOR,
  })
  @IsEnum(ProfileType, { message: 'profileType must be "mentor" or "mentee"' })
  profileType!: ProfileType;

  // ─── Mentor-only fields ────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: '[mentor] Short professional bio. Required when profileType is "mentor".',
    example: 'Senior engineer with 10 years in distributed systems.',
    maxLength: 500,
  })
  @ValidateIf(isMentor)
  @IsString()
  @MinLength(10, { message: 'bio must be at least 10 characters.' })
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description:
      '[mentor] Skills this mentor teaches. 1–20 strings, each up to 64 characters. ' +
      'Required when profileType is "mentor".',
    example: ['TypeScript', 'NestJS'],
    type: [String],
  })
  @ValidateIf(isMentor)
  @IsArray()
  @ArrayNotEmpty({ message: 'skills must contain at least one entry.' })
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  skills?: string[];

  @ApiPropertyOptional({
    description:
      '[mentor] Hourly rate in USD cents (e.g. 5000 = $50.00). ' +
      'Omit or send null to list as free / negotiate offline.',
    example: 5000,
    nullable: true,
  })
  @ValidateIf(isMentor)
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100_000, { message: 'hourlyRateUsdCents must not exceed 100 000 cents ($1 000.00).' })
  hourlyRateUsdCents?: number | null;

  @ApiPropertyOptional({
    description: '[mentor] Maximum number of active mentees to accept. Defaults to 3 if omitted.',
    example: 3,
    minimum: 1,
    maximum: 20,
  })
  @ValidateIf(isMentor)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxMentees?: number;

  // ─── Mentee-only fields ────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      '[mentee] What the mentee wants to learn or achieve. Required when profileType is "mentee".',
    example: 'I want to transition from backend to full-stack development.',
    maxLength: 500,
  })
  @ValidateIf(isMentee)
  @IsString()
  @MinLength(10, { message: 'learningGoals must be at least 10 characters.' })
  @MaxLength(500)
  learningGoals?: string;

  @ApiPropertyOptional({
    description:
      '[mentee] Topics the mentee wants to focus on. 1–20 strings, each up to 64 characters. ' +
      'Required when profileType is "mentee".',
    example: ['React', 'System Design'],
    type: [String],
  })
  @ValidateIf(isMentee)
  @IsArray()
  @ArrayNotEmpty({ message: 'interests must contain at least one entry.' })
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  interests?: string[];

  @ApiPropertyOptional({
    description:
      '[mentee] Maximum monthly budget in USD cents. Omit or send null for no preference.',
    example: 10000,
    nullable: true,
  })
  @ValidateIf(isMentee)
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(1_000_000)
  budgetUsdCentsPerMonth?: number | null;

  @ApiPropertyOptional({
    description:
      '[mentee] Self-assessed experience level. Required when profileType is "mentee".',
    enum: EXPERIENCE_LEVELS,
    example: 'intermediate',
  })
  @ValidateIf(isMentee)
  @IsEnum(EXPERIENCE_LEVELS, {
    message: 'experienceLevel must be one of: beginner, intermediate, advanced.',
  })
  experienceLevel?: ExperienceLevel;

  // ─── Shared optional fields ────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Languages for mentorship sessions. Defaults to ["English"] if omitted.',
    example: ['English', 'Spanish'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  languages?: string[];
}
