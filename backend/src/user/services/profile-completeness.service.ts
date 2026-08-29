import { Injectable, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, ProfileType } from '../entities/user.entity';
import { MentorProfile } from '../../entities/mentor-profile.entity';
import { MenteeProfile } from '../../entities/mentee-profile.entity';
import { AvailabilitySlot } from '../../entities/availability-slot.entity';
import { RedisService } from '../../auth/services/redis.service';

export interface CompletenessResult {
  score: number;
  missingFields: Array<{ field: string; description: string }>;
  suggestions?: string[];
}

export interface UserCompleteness {
  userId: string;
  email: string | null;
  displayName: string | null;
  profileType: ProfileType;
  completenessScore: number;
  missingFieldsCount: number;
}

@Injectable()
export class ProfileCompletenessService {
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private readonly CACHE_KEY_PREFIX = 'profile:completeness:';
  private readonly ADMIN_CACHE_KEY = 'admin:profile:completeness:all';

  // Required fields configuration
  private readonly MENTOR_REQUIRED_FIELDS = [
    { field: 'bio', description: 'Professional biography', source: 'mentorProfile' },
    { field: 'skills', description: 'List of skills you can mentor in', source: 'mentorProfile' },
    { field: 'hourlyRate', description: 'Hourly mentoring rate', source: 'mentorProfile' },
    { field: 'expertiseAreas', description: 'Areas of expertise', source: 'mentorProfile' },
    { field: 'avatarUrl', description: 'Profile avatar image', source: 'user' },
    { field: 'availabilitySlots', description: 'Available mentoring time slots', source: 'availability' },
  ];

  private readonly MENTEE_REQUIRED_FIELDS = [
    { field: 'learningGoals', description: 'Your learning goals and objectives', source: 'menteeProfile' },
    { field: 'currentSkillLevel', description: 'Your current skill level', source: 'menteeProfile' },
    { field: 'areasOfInterest', description: 'Areas you want to learn about', source: 'menteeProfile' },
  ];

  // Optional fields for bonus points (each contributes up to 3.33%, total 10% max)
  private readonly MENTOR_OPTIONAL_FIELDS = [
    { field: 'portfolioLinks', description: 'Portfolio or project links', source: 'mentorProfile' },
    { field: 'education', description: 'Educational background', source: 'mentorProfile' },
    { field: 'certifications', description: 'Professional certifications', source: 'mentorProfile' },
  ];

  private readonly MENTEE_OPTIONAL_FIELDS = [
    { field: 'portfolioLinks', description: 'Portfolio or project links', source: 'menteeProfile' },
    { field: 'education', description: 'Educational background', source: 'menteeProfile' },
    { field: 'certifications', description: 'Professional certifications', source: 'menteeProfile' },
  ];

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepository: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly menteeProfileRepository: Repository<MenteeProfile>,
    @InjectRepository(AvailabilitySlot)
    private readonly availabilitySlotRepository: Repository<AvailabilitySlot>,
    private readonly redisService: RedisService,
  ) {}

  async calculateUserCompleteness(userId: string): Promise<CompletenessResult> {
    // Check cache first
    const cacheKey = `${this.CACHE_KEY_PREFIX}${userId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Ignore cache parse errors
      }
    }

    // Get user and related profiles
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    let result: CompletenessResult;

    if (user.profileType === ProfileType.MENTOR || user.profileType === ProfileType.BOTH) {
      result = await this.calculateMentorCompleteness(user);
    } else {
      result = await this.calculateMenteeCompleteness(user);
    }

    // Add suggestions if score < 80%
    if (result.score < 80) {
      result.suggestions = this.generateSuggestions(result.missingFields);
    }

    // Cache the result
    await this.redisService.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);
    // Invalidate admin cache
    await this.redisService.del(this.ADMIN_CACHE_KEY);

    return result;
  }

  private async calculateMentorCompleteness(user: User): Promise<CompletenessResult> {
    const mentorProfile = await this.mentorProfileRepository.findOne({ where: { userId: user.id } });
    const availabilitySlots = await this.availabilitySlotRepository.find({ where: { mentorId: user.id } });

    const requiredFields = this.MENTOR_REQUIRED_FIELDS;
    const filledRequired: boolean[] = [];
    const missingFields: Array<{ field: string; description: string }> = [];

    // Check required fields
    for (const fieldConfig of requiredFields) {
      let isFilled = false;

      if (fieldConfig.source === 'user') {
        isFilled = this.isUserFieldFilled(user, fieldConfig.field);
      } else if (fieldConfig.source === 'mentorProfile' && mentorProfile) {
        isFilled = this.isProfileFieldFilled(mentorProfile, fieldConfig.field);
      } else if (fieldConfig.source === 'availability') {
        isFilled = availabilitySlots && availabilitySlots.length > 0;
      }

      if (isFilled) {
        filledRequired.push(true);
      } else {
        missingFields.push({ field: fieldConfig.field, description: fieldConfig.description });
      }
    }

    // Calculate base score from required fields
    const baseScore = (filledRequired.length / requiredFields.length) * 100;

    // Calculate bonus from optional fields (max 10% extra)
    let bonusScore = 0;
    if (mentorProfile) {
      const filledOptional = this.MENTOR_OPTIONAL_FIELDS.filter(fieldConfig => 
        this.isProfileFieldFilled(mentorProfile, fieldConfig.field)
      ).length;
      bonusScore = (filledOptional / this.MENTOR_OPTIONAL_FIELDS.length) * 10;
    }

    // Total score capped at 110%
    const totalScore = Math.min(baseScore + bonusScore, 110);
    // Return 0-100 for the main score as per AC, but track bonus internally
    const displayedScore = Math.min(Math.round(totalScore), 100);

    return {
      score: displayedScore,
      missingFields,
    };
  }

  private async calculateMenteeCompleteness(user: User): Promise<CompletenessResult> {
    const menteeProfile = await this.menteeProfileRepository.findOne({ where: { userId: user.id } });

    const requiredFields = this.MENTEE_REQUIRED_FIELDS;
    const filledRequired: boolean[] = [];
    const missingFields: Array<{ field: string; description: string }> = [];

    // Check required fields
    for (const fieldConfig of requiredFields) {
      let isFilled = false;

      if (fieldConfig.source === 'user') {
        isFilled = this.isUserFieldFilled(user, fieldConfig.field);
      } else if (fieldConfig.source === 'menteeProfile' && menteeProfile) {
        isFilled = this.isProfileFieldFilled(menteeProfile, fieldConfig.field);
      }

      if (isFilled) {
        filledRequired.push(true);
      } else {
        missingFields.push({ field: fieldConfig.field, description: fieldConfig.description });
      }
    }

    // Calculate base score from required fields
    const baseScore = (filledRequired.length / requiredFields.length) * 100;

    // Calculate bonus from optional fields (max 10% extra)
    let bonusScore = 0;
    if (menteeProfile) {
      const filledOptional = this.MENTEE_OPTIONAL_FIELDS.filter(fieldConfig => 
        this.isProfileFieldFilled(menteeProfile, fieldConfig.field)
      ).length;
      bonusScore = (filledOptional / this.MENTEE_OPTIONAL_FIELDS.length) * 10;
    }

    // Total score capped at 110%
    const totalScore = Math.min(baseScore + bonusScore, 110);
    // Return 0-100 for the main score as per AC
    const displayedScore = Math.min(Math.round(totalScore), 100);

    return {
      score: displayedScore,
      missingFields,
    };
  }

  private isUserFieldFilled(user: User, field: string): boolean {
    const value = (user as any)[field];
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim().length === 0) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  private isProfileFieldFilled(profile: any, field: string): boolean {
    const value = profile[field];
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim().length === 0) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'number' && value === 0) return false;
    return true;
  }

  private generateSuggestions(missingFields: Array<{ field: string; description: string }>): string[] {
    const suggestions: string[] = [];
    if (missingFields.length > 0) {
      suggestions.push(`Complete your profile to increase your visibility! You're missing ${missingFields.length} required field(s).`);
      missingFields.forEach(field => {
        suggestions.push(`Add your ${field.description.toLowerCase()} to improve your profile.`);
      });
      suggestions.push('Profiles with over 80% completion receive 3x more connection requests.');
    }
    return suggestions;
  }

  async getAllUsersCompleteness(): Promise<UserCompleteness[]> {
    // Check cache first
    const cached = await this.redisService.get(this.ADMIN_CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Ignore cache parse errors
      }
    }

    // Get all active users
    const users = await this.userRepository.find({ where: { status: 'active' } });
    
    const results: UserCompleteness[] = [];
    
    for (const user of users) {
      const completeness = await this.calculateUserCompleteness(user.id);
      results.push({
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        profileType: user.profileType,
        completenessScore: completeness.score,
        missingFieldsCount: completeness.missingFields.length,
      });
    }

    // Cache the result
    await this.redisService.set(this.ADMIN_CACHE_KEY, JSON.stringify(results), this.CACHE_TTL);

    return results;
  }

  // Clear cache for a user when their profile is updated
  async clearUserCache(userId: string): Promise<void> {
    await this.redisService.del(`${this.CACHE_KEY_PREFIX}${userId}`);
    await this.redisService.del(this.ADMIN_CACHE_KEY);
  }
}