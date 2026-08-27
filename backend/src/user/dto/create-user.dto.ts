import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileType } from '../entities/user.entity';

export class CreateUserDto {
  @ApiPropertyOptional({
    description: 'Stellar wallet address (Ed25519 public key, G-address)',
    example: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
  })
  @IsOptional()
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'walletAddress must be a valid 56-character Stellar public key (G-address)',
  })
  walletAddress?: string;

  @ApiPropertyOptional({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Display name of the user',
    example: 'Alex Rivers',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Plain text password (optional, hashed before storage)',
    example: 'StrongPassword123!',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @Length(8, 100)
  password?: string;

  @ApiPropertyOptional({
    description: 'User biography or introduction',
    example: 'Senior Full Stack Engineer & Mentor',
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({
    description: 'URL to avatar image',
    example: 'https://example.com/avatars/user1.png',
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Type of profile',
    enum: ProfileType,
    default: ProfileType.MENTEE,
    example: ProfileType.MENTOR,
  })
  @IsOptional()
  @IsEnum(ProfileType)
  profileType?: ProfileType;

  @ApiPropertyOptional({
    description: 'User configuration and preference settings',
    example: { notifications: true, theme: 'dark', emailAlerts: true },
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;
}
