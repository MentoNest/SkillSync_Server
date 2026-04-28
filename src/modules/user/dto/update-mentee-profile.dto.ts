import { IsOptional, IsString, IsInt, Min, IsArray, IsIn, Length } from 'class-validator';
import { SkillLevel } from '../entities/mentee-profile.entity';

export class UpdateMenteeProfileDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(0, 500, { each: true })
  learningGoals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areasOfInterest?: string[];

  @IsOptional()
  @IsIn([SkillLevel.BEGINNER, SkillLevel.INTERMEDIATE, SkillLevel.ADVANCED])
  currentSkillLevel?: SkillLevel;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredMentoringStyle?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  timeCommitmentHoursPerWeek?: number;

  @IsOptional()
  @IsString()
  professionalBackground?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  portfolioLinks?: string[];
}