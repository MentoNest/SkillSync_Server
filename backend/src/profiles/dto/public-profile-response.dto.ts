export class PublicProfileResponseDto {
  userId: string;
  profileType: 'mentor' | 'mentee';
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  profileCompletion: number;

  // mentor-only fields
  bio?: string | null;
  skills?: string[];
  hourlyRate?: number;
  expertiseAreas?: string[];
  averageRating?: number;
  totalMentoringHours?: number;

  // mentee-only fields
  goals?: string[];
  interests?: string[];
  joinedAt?: Date;
}
