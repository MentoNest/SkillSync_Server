import { IsOptional, IsString, IsInt, Min, IsArray, IsIn, Length } from 'class-validator';

export class UpdateMentorProfileDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;

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