import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '../../auth/entities/user.entity';

export class UserResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75' })
  walletAddress: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  email?: string;

  @ApiPropertyOptional({ example: 'Alice' })
  displayName?: string;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status: UserStatus;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png' })
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'America/New_York' })
  timezone?: string;

  @ApiPropertyOptional({ example: 'en-US' })
  locale?: string;

  @ApiProperty({ type: [String], example: ['mentee'] })
  roles: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  lastLoginAt?: Date;
}
