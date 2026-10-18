import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  MAX_LEARNING_GOALS,
  MAX_LEARNING_GOAL_LENGTH,
  MAX_PREFERRED_STYLES,
  SkillLevel,
} from '../../entities/mentee-profile.entity';
import {
  MAX_BIO_LENGTH,
  MAX_HOURLY_RATE,
  MAX_SKILLS,
  MIN_HOURLY_RATE,
} from '../../entities/mentor-profile.entity';

export enum ProfileType {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

/** Type-specific payload used when creating a mentor profile. */
export class CreateMentorProfileDataDto {
  @ApiProperty({ maxLength: MAX_BIO_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BIO_LENGTH)
  bio!: string;

  @ApiProperty({ type: [String], maxItems: MAX_SKILLS })
  @IsArray()
  @ArrayMaxSize(MAX_SKILLS)
  @IsString({ each: true })
  skills!: string[];

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

/** Type-specific payload used when creating a mentee profile. */
export class CreateMenteeProfileDataDto {
  @ApiProperty({ type: [String], maxItems: MAX_LEARNING_GOALS })
  @IsArray()
  @ArrayMaxSize(MAX_LEARNING_GOALS)
  @IsString({ each: true })
  @MaxLength(MAX_LEARNING_GOAL_LENGTH, { each: true })
  learningGoals!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  areasOfInterest!: string[];

  @ApiProperty({ enum: SkillLevel })
  @IsEnum(SkillLevel)
  skillLevel!: SkillLevel;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_PREFERRED_STYLES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PREFERRED_STYLES)
  @IsString({ each: true })
  preferredMentoringStyle?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  timeCommitmentHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  professionalBackground?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  portfolioLinks?: string[];
}

/** Body of POST /user/profile. Exactly one of mentor/mentee is required per profileType. */
export class CreateProfileDto {
  @ApiProperty({ enum: ProfileType })
  @IsEnum(ProfileType)
  profileType!: ProfileType;

  @ApiPropertyOptional({ type: CreateMentorProfileDataDto })
  @ValidateIf((o: CreateProfileDto) => o.profileType === ProfileType.MENTOR)
  @IsObject()
  @ValidateNested()
  @Type(() => CreateMentorProfileDataDto)
  mentor?: CreateMentorProfileDataDto;

  @ApiPropertyOptional({ type: CreateMenteeProfileDataDto })
  @ValidateIf((o: CreateProfileDto) => o.profileType === ProfileType.MENTEE)
  @IsObject()
  @ValidateNested()
  @Type(() => CreateMenteeProfileDataDto)
  mentee?: CreateMenteeProfileDataDto;
}

/** Body of PATCH /user/profile/:type. Every field is optional for partial updates. */
export class UpdateProfileDto {
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

  @ApiPropertyOptional({ type: [String], maxItems: MAX_LEARNING_GOALS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LEARNING_GOALS)
  @IsString({ each: true })
  @MaxLength(MAX_LEARNING_GOAL_LENGTH, { each: true })
  learningGoals?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasOfInterest?: string[];

  @ApiPropertyOptional({ enum: SkillLevel })
  @IsOptional()
  @IsEnum(SkillLevel)
  skillLevel?: SkillLevel;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_PREFERRED_STYLES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PREFERRED_STYLES)
  @IsString({ each: true })
  preferredMentoringStyle?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  timeCommitmentHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  professionalBackground?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  portfolioLinks?: string[];
}
