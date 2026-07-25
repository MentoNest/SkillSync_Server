import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EducationDto {
  @IsString()
  institution: string;

  @IsString()
  degree: string;

  @IsString()
  @IsOptional()
  fieldOfStudy?: string;

  @IsInt()
  @IsOptional()
  graduationYear?: number;
}

export class CertificationDto {
  @IsString()
  name: string;

  @IsString()
  issuingOrganization: string;

  @IsString()
  @IsOptional()
  issueDate?: string;

  @IsString()
  @IsOptional()
  expirationDate?: string;
}

export class CreateMentorProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  skills?: string[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  hourlyRate?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  expertiseAreas?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  yearsOfExperience?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  currentRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationDto)
  education?: EducationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CertificationDto)
  certifications?: CertificationDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  languages?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mentoringStyleDescription?: string;
}
