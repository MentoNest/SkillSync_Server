import { IsString, IsOptional, IsArray, IsNumber, IsUrl, IsBoolean, IsTimeZone } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMentorProfileDto {
  @ApiPropertyOptional({ description: 'Professional bio' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'List of technical skills' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Years of experience' })
  @IsOptional()
  @IsNumber()
  experienceYears?: number;

  @ApiPropertyOptional({ description: 'Job title or position' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Company name' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'LinkedIn profile URL' })
  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({ description: 'Portfolio or personal website URL' })
  @IsOptional()
  @IsUrl()
  portfolioUrl?: string;

  @ApiPropertyOptional({
    description: 'List of portfolio or project URLs',
    example: ['https://github.com/user', 'https://myproject.dev'],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  portfolioLinks?: string[];

  @ApiPropertyOptional({ description: 'Hourly rate' })
  @IsOptional()
  @IsNumber()
  hourlyRate?: number;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsUrl()
  profileImageUrl?: string;

  @ApiPropertyOptional({ description: 'Is profile available for mentoring' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    description: 'IANA timezone identifier (e.g. "America/New_York", "Europe/London")',
    example: 'America/New_York',
  })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
