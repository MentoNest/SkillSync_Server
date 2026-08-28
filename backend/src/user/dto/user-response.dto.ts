import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileType, User, UserStatus } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty({
    description: 'Unique user identifier (UUID v4)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiPropertyOptional({
    description: 'Wallet address',
    example: '0x71C841832047387195060979DC80EbbE62DCE35B',
  })
  walletAddress: string | null;

  @ApiPropertyOptional({
    description: 'User email',
    example: 'user@example.com',
  })
  email: string | null;

  @ApiPropertyOptional({
    description: 'User display name',
    example: 'Alex Rivers',
  })
  displayName: string | null;

  @ApiPropertyOptional({
    description: 'Unique username/handle',
    example: 'alex_rivers',
  })
  username: string | null;

  @ApiPropertyOptional({
    description: 'When the username was last changed (governs the 30-day cooldown)',
    example: null,
  })
  usernameChangedAt: Date | null;

  @ApiPropertyOptional({
    description: 'User biography',
    example: 'Staff Software Architect specializing in Web3 and Distributed Systems.',
  })
  bio: string | null;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://example.com/avatars/user1.png',
  })
  avatarUrl: string | null;

  @ApiProperty({
    description: 'Profile type',
    enum: ProfileType,
    example: ProfileType.MENTOR,
  })
  profileType: ProfileType;

  @ApiProperty({
    description: 'User preferences & settings',
    example: { notifications: true, theme: 'light', emailAlerts: true },
  })
  settings: Record<string, any>;

  @ApiProperty({
    description: 'Account lifecycle status',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @ApiProperty({
    description: 'Account lock status',
    example: false,
  })
  isLocked: boolean;

  @ApiPropertyOptional({
    description: 'Lockout expiry timestamp if locked',
    example: null,
  })
  lockoutUntil: Date | null;

  @ApiPropertyOptional({
    description: 'Timestamp of last successful login',
    example: '2026-08-25T12:00:00.000Z',
  })
  lastLoginAt: Date | null;

  @ApiProperty({
    description: 'User role names',
    example: ['mentor'],
    type: [String],
  })
  roles: string[];

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2026-08-01T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last account update timestamp',
    example: '2026-08-25T12:00:00.000Z',
  })
  updatedAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.walletAddress = user.walletAddress;
    dto.email = user.email;
    dto.displayName = user.displayName;
    dto.username = user.username;
    dto.usernameChangedAt = user.usernameChangedAt;
    dto.bio = user.bio;
    dto.avatarUrl = user.avatarUrl;
    dto.profileType = user.profileType;
    dto.settings = user.settings || {};
    dto.status = user.status;
    dto.isLocked = user.isLocked;
    dto.lockoutUntil = user.lockoutUntil;
    dto.lastLoginAt = user.lastLoginAt;
    dto.roles = user.roles ? user.roles.map((r) => r.name) : [];
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
