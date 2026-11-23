import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '../user-status.enum';

export class UserResponseDto {
  @ApiProperty() walletAddress!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) username!: string | null;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) timezone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) locale!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ description: 'True when this user has an active featured mentor profile.' })
  isFeatured?: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'Badge shown on featured mentor cards.' })
  featuredBadge?: string | null;
  @ApiPropertyOptional({ description: 'Profile completeness score (0–110).', example: 85 })
  completenessScore?: number;
}
