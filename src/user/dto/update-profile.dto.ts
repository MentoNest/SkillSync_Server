import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  IsBoolean,
  IsUrl,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

class SocialLinksDto {
  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  linkedin?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  github?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  twitter?: string;
}

export class UpdateProfileDto {
  @ApiProperty({ description: 'User first name', required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ description: 'User last name', required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ description: 'User phone number', required: false })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({ description: 'User address', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ description: 'User gender', required: false })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiProperty({ description: 'User about section', required: false })
  @IsString()
  @IsOptional()
  about?: string;

  @ApiProperty({ description: 'User bio', required: false })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiProperty({ description: 'User skills', required: false, type: [String] })
  @IsArray()
  @IsOptional()
  skills?: string[];

  @ApiProperty({ description: 'User experience level', required: false })
  @IsString()
  @IsOptional()
  experienceLevel?: string;

  @ApiProperty({
    description: 'User social media links',
    required: false,
    type: SocialLinksDto,
  })
  @IsObject()
  @IsOptional()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;

  @ApiProperty({
    description: 'User availability status',
    required: false,
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}
