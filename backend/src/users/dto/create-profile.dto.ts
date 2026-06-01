import { AuthRole } from '../../auth/enums/auth-role.enum';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateProfileDto {
  @IsEnum(AuthRole)
  profileType: AuthRole;

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTOR)
  @IsString()
  @IsNotEmpty()
  bio?: string;

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTOR)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  expertise?: string[];

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTOR)
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTOR || obj.profileType === AuthRole.MENTEE)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  preferredMentoringStyle?: string[];

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTOR)
  @IsInt()
  @Min(0)
  @IsOptional()
  availabilityHoursPerWeek?: number;

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTOR)
  @IsString()
  @IsOptional()
  availabilityDetails?: string;

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTEE)
  @IsString()
  @IsNotEmpty()
  learningGoals?: string;

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTEE)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  areasOfInterest?: string[];

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTEE)
  @IsString()
  @IsNotEmpty()
  currentSkillLevel?: string;


  @ValidateIf((obj) => obj.profileType === AuthRole.MENTEE)
  @IsInt()
  @Min(0)
  @IsNotEmpty()
  timeCommitmentHoursPerWeek?: number;

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTEE)
  @IsString()
  @IsOptional()
  professionalBackground?: string;

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTEE)
  @IsString()
  @IsOptional()
  jobTitle?: string;

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTEE)
  @IsString()
  @IsOptional()
  industry?: string;

  @ValidateIf((obj) => obj.profileType === AuthRole.MENTEE)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  portfolioLinks?: string[];
}
