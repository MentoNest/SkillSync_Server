import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  MaxLength,
  Min,
} from 'class-validator';
import { SkillLevel } from '../entities/mentee-profile.entity';

export class CreateMenteeProfileDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @IsOptional()
  learningGoals?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  areasOfInterest?: string[];

  @IsEnum(SkillLevel)
  @IsOptional()
  currentSkillLevel?: SkillLevel;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  preferredMentoringStyle?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  timeCommitment?: number;

  @IsString()
  @IsOptional()
  professionalBackground?: string;

  @IsString()
  @IsOptional()
  jobTitle?: string;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  portfolioLinks?: string[];
}

export class UpdateMenteeProfileDto extends CreateMenteeProfileDto {}
