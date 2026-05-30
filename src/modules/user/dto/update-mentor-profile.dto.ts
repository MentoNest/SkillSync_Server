import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  IsArray,
  Length,
  ArrayMaxSize,
  ArrayUnique,
  IsNumber,
  Max,
  IsBoolean,
  ValidateNested,
} from 'class-validator';

export class UpdateMentorProfileDto {
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  bio?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  hourlyRate?: number;

  @IsOptional()
  @IsString()
  currentRole?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsArray()
  education?: any[];

  @IsOptional()
  @IsArray()
  certifications?: any[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsString()
  mentoringStyleDescription?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expertise?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredMentoringStyle?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  availabilityHoursPerWeek?: number;

  @IsOptional()
  @IsString()
  availabilityDetails?: string;
}