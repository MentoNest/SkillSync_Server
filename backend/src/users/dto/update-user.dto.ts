import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'alice@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'Alice Onchain' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  avatarUrl?: string;

  @ApiPropertyOptional({ maxLength: 64, example: 'Europe/Berlin' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string;

  @ApiPropertyOptional({ maxLength: 16, example: 'en' })
  @IsOptional()
  @IsString()
  @Length(2, 16)
  locale?: string;
}
