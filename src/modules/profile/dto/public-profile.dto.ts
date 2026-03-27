import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums/user-role.enum';
import { MenteeGoal } from '../entities/mentee-profile.entity';

export class PublicProfileDto {
  @ApiProperty({ description: 'User unique username' })
  username: string;

  @ApiPropertyOptional({ description: 'User first name' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'User last name' })
  lastName?: string;

  @ApiProperty({ description: 'User role', enum: UserRole })
  role: UserRole;

  @ApiProperty({ description: 'Profile creation date' })
  createdAt: Date;

  // Mentor profile fields
  @ApiPropertyOptional({ description: 'Professional bio' })
  bio?: string;

  @ApiPropertyOptional({ description: 'List of technical skills' })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Years of experience' })
  experienceYears?: number;

  @ApiPropertyOptional({ description: 'Job title or position' })
  title?: string;

  @ApiPropertyOptional({ description: 'Company name' })
  company?: string;

  @ApiPropertyOptional({ description: 'LinkedIn profile URL' })
  linkedinUrl?: string;

  @ApiPropertyOptional({ description: 'Portfolio or personal website URL' })
  portfolioUrl?: string;

  @ApiPropertyOptional({ description: 'List of portfolio or project URLs' })
  portfolioLinks?: string[];

  @ApiPropertyOptional({ description: 'Hourly rate' })
  hourlyRate?: number;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  profileImageUrl?: string;

  @ApiPropertyOptional({ description: 'Is mentor profile verified by admin' })
  isVerified?: boolean;

  @ApiPropertyOptional({ description: 'IANA timezone identifier' })
  timezone?: string;

  // Mentee profile fields
  @ApiPropertyOptional({ description: 'Areas of interest for learning' })
  interests?: string[];

  @ApiPropertyOptional({ description: 'Learning goals', enum: MenteeGoal })
  primaryGoal?: MenteeGoal;

  @ApiPropertyOptional({ description: 'Additional goals or specific learning objectives' })
  goals?: string[];

  @ApiPropertyOptional({ description: 'Current skill level' })
  skillLevel?: string;

  @ApiPropertyOptional({ description: 'Preferred learning style' })
  learningStyle?: string;

  @ApiPropertyOptional({ description: 'Time availability per week (hours)' })
  weeklyAvailability?: number;

  @ApiPropertyOptional({ description: 'Is actively seeking mentorship' })
  isSeekingMentor?: boolean;
}
