import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileType } from '../entities/user.entity';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Updated display name of the user',
    example: 'Alex R. Rivers',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Updated email address',
    example: 'new.email@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Updated biography',
    example: 'Staff Software Architect specializing in Web3 and Distributed Systems.',
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({
    description: 'Updated avatar image URL',
    example: 'https://example.com/avatars/new-avatar.png',
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Updated profile type',
    enum: ProfileType,
    example: ProfileType.BOTH,
  })
  @IsOptional()
  @IsEnum(ProfileType)
  profileType?: ProfileType;

  @ApiPropertyOptional({
    description: 'Updated user settings and preferences',
    example: { notifications: false, theme: 'system', emailAlerts: true },
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;
}
