/**
 * Public Mentee Profile DTO - Safe data exposed without authentication
 * Only anonymized or user-consented information
 * Excludes: wallet address, email, internal status, job title details, professional background
 */
export class PublicMenteeProfileDto {
  userId!: string;

  displayName?: string;

  avatarUrl?: string;

  learningGoals!: string;

  areasOfInterest?: string[];

  currentSkillLevel!: string;

  profileCompleteness: number = 0;

  profileType: 'MENTEE' = 'MENTEE';

  joinDate!: Date;
}
