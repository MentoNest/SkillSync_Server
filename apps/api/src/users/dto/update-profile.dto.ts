import {
  IsOptional,
  IsString,
  MaxLength,
  IsObject,
  IsUrl,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIanaTimezone } from '../validators/iana-ttimezone.validator';
export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({
    example: {
      github: 'https://github.com/username',
      twitter: 'https://twitter.com/username',
      linkedin: 'https://linkedin.com/in/username',
    },
  })
  @IsOptional()
  @IsObject()
  socials?: {
    github?: string;
    twitter?: string;
    linkedin?: string;
  };
}
