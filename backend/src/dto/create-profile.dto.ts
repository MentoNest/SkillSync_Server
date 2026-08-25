import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { SkillLevel } from '../entities/mentee-profile.entity';

export enum ProfileType {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

export class CreateProfileDto {
  @IsEnum(ProfileType)
  @IsNotEmpty()
  profileType: ProfileType;

  // Mentor specific fields
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  bio?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  skills?: string[];

  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  hourlyRate?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  expertiseAreas?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  yearsOfExperience?: number;

  @IsString()
  @IsOptional()
  currentRole?: string;

  @IsString()
  @IsOptional()
  company?: string;

  @IsArray()
  @IsOptional()
  education?: Array<{
    school: string;
    degree: string;
    fieldOfStudy?: string;
    startYear?: number;
    endYear?: number;
  }>;

  @IsArray()
  @IsOptional()
  certifications?: Array<{
    title: string;
    issuer: string;
    issueDate?: string;
    credentialUrl?: string;
  }>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languagesSpoken?: string[];

  @IsString()
  @IsOptional()
  mentoringStyle?: string;

  @IsBoolean()
  @IsOptional()
  isVerified?: boolean;

  // Mentee specific fields
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
