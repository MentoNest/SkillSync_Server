import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { IsIanaTimezone } from '../../common/validators';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Email address', example: 'alice@example.com', type: String, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ description: 'Display name', example: 'Alice', type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string | null;

  @ApiPropertyOptional({ description: 'Avatar URL', type: String, nullable: true })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  avatarUrl?: string | null;

  @ApiPropertyOptional({ description: 'IANA timezone', example: 'UTC', type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @IsIanaTimezone()
  timezone?: string | null;

  @ApiPropertyOptional({ description: 'Locale', example: 'en-US', type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string | null;

  @ApiPropertyOptional({ description: 'Education history', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  education?: string[];

  @ApiPropertyOptional({ description: 'Certifications', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  certifications?: string[];
}
