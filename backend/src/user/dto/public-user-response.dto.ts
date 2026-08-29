import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MentorProfile } from '../../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';

/**
 * #1173: Public user profile returned by GET /users.
 * Sensitive fields (email, walletAddress) are only included when the
 * request is authenticated as an admin.
 */
export class PublicUserResponseDto {
  @ApiProperty({ description: 'Unique user identifier', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiPropertyOptional({ description: 'Public display name', example: 'Alex Rivers' })
  displayName: string | null;

  @ApiPropertyOptional({ description: 'Unique username/handle, usable in /profiles/:username', example: 'alex_rivers' })
  username: string | null;

  @ApiPropertyOptional({ description: 'Public biography' })
  bio: string | null;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  avatarUrl: string | null;

  @ApiProperty({ description: 'Role names', example: ['mentor'], type: [String] })
  roles: string[];

  @ApiProperty({ description: 'Account creation timestamp' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'Mentor skills (mentors only)', type: [String] })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Average mentor rating (mentors only)', example: 4.8 })
  averageRating?: number;

  @ApiPropertyOptional({ description: 'Email (admin only)' })
  email?: string | null;

  @ApiPropertyOptional({ description: 'Stellar wallet address (admin only)' })
  walletAddress?: string | null;

  static fromEntity(user: User, mentorProfile?: MentorProfile, isAdmin = false): PublicUserResponseDto {
    const dto = new PublicUserResponseDto();
    dto.id = user.id;
    dto.displayName = user.displayName;
    dto.username = user.username;
    dto.bio = user.bio;
    dto.avatarUrl = user.avatarUrl;
    dto.roles = user.roles ? user.roles.map((r) => r.name) : [];
    dto.createdAt = user.createdAt;

    if (mentorProfile) {
      dto.skills = mentorProfile.skills || [];
      dto.averageRating = Number(mentorProfile.averageRating || 0);
    }

    if (isAdmin) {
      dto.email = user.email;
      dto.walletAddress = user.walletAddress;
    }

    return dto;
  }
}
