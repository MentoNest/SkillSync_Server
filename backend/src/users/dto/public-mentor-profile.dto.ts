/**
 * Public Mentor Profile DTO - Safe data exposed without authentication
 * Excludes: wallet address, email, internal status fields, internal notes
 */
export class PublicMentorProfileDto {
  userId!: string;

  displayName?: string;

  avatarUrl?: string;

  bio!: string;

  expertise?: string[];

  yearsOfExperience!: number;

  hourlyRate?: number;

  averageRating: number = 0;

  totalSessions: number = 0;

  profileCompleteness: number = 0;

  isVerified: boolean = false;

  profileType: 'MENTOR' = 'MENTOR';

  joinDate!: Date;
}
