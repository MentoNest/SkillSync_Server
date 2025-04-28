import { IsOptional, IsString, IsPhoneNumber, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ required: false, description: 'User first name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ required: false, description: 'User last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ required: false, description: 'User address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false, description: 'User phone number' })
  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @ApiProperty({ required: false, description: 'User gender' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty({ required: false, description: 'User about section' })
  @IsOptional()
  @IsString()
  about?: string;

  @ApiProperty({ required: false, description: 'User profile picture URL' })
  @IsOptional()
  @IsString()
  profilePicture?: string;
} 