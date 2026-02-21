import { IsString, IsNotEmpty, IsEmail, Length, IsOptional, IsEnum, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums/user-role.enum';

export class CreateUserDto {
  @ApiProperty({
    description: 'User\'s email address',
    example: 'john.doe@example.com',
  })
  @IsEmail({}, {
    message: 'Invalid email format',
  })
  @IsNotEmpty({
    message: 'Email is required',
  })
  email: string;

  @ApiProperty({
    description: 'User\'s full name',
    example: 'John Doe',
  })
  @IsString({
    message: 'Name must be a string',
  })
  @IsNotEmpty({
    message: 'Name is required',
  })
  @Length(2, 100, {
    message: 'Name must be between 2 and 100 characters',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'User\'s role',
    enum: UserRole,
    example: UserRole.MENTEE,
  })
  @IsEnum(UserRole, {
    message: 'Role must be one of: mentee, mentor, admin',
  })
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'User\'s wallet address',
    example: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  })
  @IsString({
    message: 'Wallet address must be a string',
  })
  @IsOptional()
  walletAddress?: string;

  @ApiPropertyOptional({
    description: 'User\'s profile picture URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsUrl({}, {
    message: 'Invalid URL format for profile picture',
  })
  @IsOptional()
  profilePicture?: string;

  @ApiPropertyOptional({
    description: 'User\'s bio/description',
    example: 'Software developer with 5 years of experience',
  })
  @IsString({
    message: 'Bio must be a string',
  })
  @IsOptional()
  @Length(0, 500, {
    message: 'Bio must be less than 500 characters',
  })
  bio?: string;
}