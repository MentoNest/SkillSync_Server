import {
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

export class CreateMentorProfileDto {
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
}

export class UpdateMentorProfileDto extends CreateMentorProfileDto {}
