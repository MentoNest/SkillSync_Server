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
}
