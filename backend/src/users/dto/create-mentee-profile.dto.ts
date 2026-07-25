import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import { SkillLevel } from '../entities/mentee-profile.entity.js';

export class CreateMenteeProfileDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @ArrayMaxSize(10)
  learningGoals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  areasOfInterest?: string[];

  @IsOptional()
  @IsEnum(SkillLevel)
  currentSkillLevel?: SkillLevel;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  preferredMentoringStyle?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(40)
  timeCommitmentHoursPerWeek?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  professionalBackground?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  portfolioLinks?: string[];
}
