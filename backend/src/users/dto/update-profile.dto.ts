import { AuthRole } from '../../auth/enums/auth-role.enum';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bio?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  expertise?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  preferredMentoringStyle?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  availabilityHoursPerWeek?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  availabilityDetails?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  learningGoals?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  areasOfInterest?: string[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currentSkillLevel?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  timeCommitmentHoursPerWeek?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  professionalBackground?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  industry?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  portfolioLinks?: string[];
}
