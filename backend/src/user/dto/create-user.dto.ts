import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { UserStatus } from '../user-status.enum';

export class CreateUserDto {
  @ApiProperty({ description: 'Stellar wallet address', example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37' })
  @IsString()
  @Length(56, 56)
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

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
