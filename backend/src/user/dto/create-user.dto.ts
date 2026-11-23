import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsIanaTimezone, IsValidWalletAddress } from '../../common/validators';
import { UserStatus } from '../user-status.enum';

export class CreateUserDto {
  @ApiProperty({ description: 'Stellar wallet address', example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsValidWalletAddress()
  walletAddress!: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'alice@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ description: 'Display name', example: 'Alice' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string | null;

  @ApiPropertyOptional({ description: 'IANA timezone preference.', example: 'America/New_York', default: 'UTC' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
