import { ApiProperty } from '@nestjs/swagger';
import { User, UserStatus } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  walletAddress!: string;

  @ApiProperty()
  email!: string | null;

  @ApiProperty()
  displayName!: string | null;

  @ApiProperty()
  avatarUrl!: string | null;

  @ApiProperty()
  timezone!: string | null;

  @ApiProperty()
  locale!: string | null;

  @ApiProperty()
  status!: UserStatus;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty()
  lastLoginAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.walletAddress = user.walletAddress;
    dto.email = user.email ?? null;
    dto.displayName = user.displayName ?? null;
    dto.avatarUrl = user.avatarUrl ?? null;
    dto.timezone = user.timezone ?? null;
    dto.locale = user.locale ?? null;
    dto.status = user.status ?? 'active';
    dto.roles = (user.roles ?? []).map((role) => role.name);
    dto.lastLoginAt = user.lastLoginAt ?? null;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
