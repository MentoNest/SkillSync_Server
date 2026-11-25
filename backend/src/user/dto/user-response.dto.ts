import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '../user-status.enum';

export class UserResponseDto {
  @ApiProperty() walletAddress!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) username!:
    string | null;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiPropertyOptional({
    description: 'Avatar URL.',
    type: String,
    nullable: true,
  })
  avatarUrl!: string | null;
  @ApiPropertyOptional({
    description: 'Avatar thumbnail URL (64x64).',
    type: String,
    nullable: true,
  })
  avatarThumbnailUrl?: string | null;
  @ApiProperty({
    description: 'IANA timezone preference used for display.',
    example: 'UTC',
    type: String,
  })
  timezone!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) locale!: string | null;
  @ApiPropertyOptional({
    description: 'UTC timestamp of the last login.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  lastLoginAt!: Date | null;
  @ApiProperty({ description: 'UTC timestamp of account creation.' })
  createdAt!: Date;
  @ApiProperty({ description: 'UTC timestamp of the latest account update.' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    description: 'True when this user has an active featured mentor profile.',
  })
  isFeatured?: boolean;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Badge shown on featured mentor cards.',
  })
  featuredBadge?: string | null;
  @ApiProperty({
    description: 'Whether this user has a verified mentor profile.',
  })
  isVerified!: boolean;
  @ApiPropertyOptional({
    nullable: true,
    description: 'UTC date of mentor verification.',
  })
  verifiedAt!: Date | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Badge shown on verified mentor cards.',
  })
  verifiedBadge!: string | null;
  @ApiPropertyOptional({
    description: 'Profile completeness score (0–110).',
    example: 85,
  })
  completenessScore?: number;
}
