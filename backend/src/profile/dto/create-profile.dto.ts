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
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SkillLevel } from '../mentee-profile.entity';

export enum ProfileType {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

export type ExperienceLevel = `${SkillLevel}`;
export const EXPERIENCE_LEVELS: SkillLevel[] = [
  SkillLevel.BEGINNER,
  SkillLevel.INTERMEDIATE,
  SkillLevel.ADVANCED,
];

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
    description:
      'Which profile type to create. A user may hold at most one of each type.',
    enum: ProfileType,
    example: ProfileType.MENTOR,
  })
  @IsEnum(ProfileType, { message: 'profileType must be "mentor" or "mentee"' })
  profileType!: ProfileType;

  // ─── Mentor-only fields ────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      '[mentor] Short professional bio. Required when profileType is "mentor".',
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
    type: Number,
    nullable: true,
  })
  @ValidateIf(isMentor)
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100_000, {
    message: 'hourlyRateUsdCents must not exceed 100 000 cents ($1 000.00).',
  })
  hourlyRateUsdCents?: number | null;

  @ApiPropertyOptional({
    description:
      '[mentor] Maximum number of active mentees to accept. Defaults to 3 if omitted.',
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
      '[mentee] Learning goals the mentee wants to achieve (1–20 items, max 500 chars each). Required when profileType is "mentee".',
    example: ['Transition from backend to full-stack development'],
    type: [String],
  })
  @ValidateIf(isMentee)
  @IsArray()
  @ArrayNotEmpty({ message: 'learningGoals must contain at least one entry.' })
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MinLength(3, {
    each: true,
    message: 'Each learning goal must be at least 3 characters.',
  })
  @MaxLength(500, {
    each: true,
    message: 'Each learning goal must not exceed 500 characters.',
  })
  learningGoals?: string[];

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
    type: Number,
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
      '[mentee] Self-assessed current skill level. Required when profileType is "mentee".',
    enum: SkillLevel,
    example: SkillLevel.INTERMEDIATE,
  })
  @ValidateIf(isMentee)
  @IsEnum(SkillLevel, {
    message:
      'experienceLevel must be one of: beginner, intermediate, advanced.',
  })
  experienceLevel?: SkillLevel | ExperienceLevel;

  @ApiPropertyOptional({
    description:
      '[mentee] Preferred mentoring styles (e.g. career advice, technical skills, interview prep).',
    example: ['technical skills', 'interview prep'],
    type: [String],
  })
  @ValidateIf(isMentee)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  preferredMentoringStyle?: string[];

  @ApiPropertyOptional({
    description: '[mentee] Time commitment in hours per week.',
    example: 5,
    minimum: 1,
    maximum: 168,
    nullable: true,
  })
  @ValidateIf(isMentee)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  timeCommitmentHoursPerWeek?: number | null;

  @ApiPropertyOptional({
    description: '[mentee] Professional background summary.',
    example: '3 years working on backend APIs.',
    maxLength: 2000,
    nullable: true,
  })
  @ValidateIf(isMentee)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  professionalBackground?: string | null;

  @ApiPropertyOptional({
    description: '[mentee] Optional current job title.',
    example: 'Software Engineer',
    maxLength: 120,
    nullable: true,
  })
  @ValidateIf(isMentee)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string | null;

  @ApiPropertyOptional({
    description: '[mentee] Optional industry sector.',
    example: 'FinTech',
    maxLength: 120,
    nullable: true,
  })
  @ValidateIf(isMentee)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string | null;

  @ApiPropertyOptional({
    description: '[mentee] Optional portfolio links.',
    example: ['https://github.com/alice'],
    type: [String],
  })
  @ValidateIf(isMentee)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_tld: false, require_protocol: true }, { each: true })
  @MaxLength(2048, { each: true })
  portfolioLinks?: string[];

  // ─── Shared optional fields ────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Languages for mentorship sessions. Defaults to ["English"] if omitted.',
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
