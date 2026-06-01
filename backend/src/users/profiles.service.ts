import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { User } from './entities/user.entity';
import { MentorProfile } from './entities/mentor-profile.entity';
import { MenteeProfile } from './entities/mentee-profile.entity';
import { PublicMentorProfileDto } from './dto/public-mentor-profile.dto';
import { PublicMenteeProfileDto } from './dto/public-mentee-profile.dto';
import { PublicProfileResponse } from './dto/public-profile-response.dto';
import { AuthRole } from '../auth/enums/auth-role.enum';

/**
 * Public Profiles Service
 * Handles retrieval of public-safe profile data with Redis caching
 */
@Injectable()
export class PublicProfilesService {
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'public:profile:';

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(MentorProfile) private readonly mentorProfileRepo: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile) private readonly menteeProfileRepo: Repository<MenteeProfile>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get public profile by user ID with caching
   * Returns mentor or mentee profile based on which exists
   */
  async getPublicProfile(userId: string): Promise<PublicProfileResponse> {
    // Check cache first
    const cacheKey = `${this.CACHE_PREFIX}${userId}`;
    const cachedProfile = await this.getCachedProfile(cacheKey);
    if (cachedProfile) {
      return cachedProfile;
    }

    // Fetch user with relations
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['mentorProfile', 'menteeProfile', 'roles'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let profile: PublicProfileResponse | null = null;

    // Check if user has mentor profile
    if (user.mentorProfile) {
      profile = this.buildPublicMentorProfile(user, user.mentorProfile);
    }
    // Otherwise check for mentee profile
    else if (user.menteeProfile) {
      profile = this.buildPublicMenteeProfile(user, user.menteeProfile);
    }
    // If neither profile exists, throw 404
    else {
      throw new NotFoundException('User profile not found');
    }

    // Cache the profile
    await this.setCachedProfile(cacheKey, profile);

    return profile;
  }

  /**
   * Build public mentor profile DTO
   */
  private buildPublicMentorProfile(user: User, mentorProfile: MentorProfile): PublicMentorProfileDto {
    const dto = new PublicMentorProfileDto();
    dto.userId = user.id;
    dto.displayName = user.displayName;
    dto.avatarUrl = user.avatarUrl;
    dto.bio = mentorProfile.bio;
    dto.expertise = mentorProfile.expertise;
    dto.yearsOfExperience = mentorProfile.yearsOfExperience;
    dto.hourlyRate = mentorProfile.hourlyRate ? Number(mentorProfile.hourlyRate) : undefined;
    dto.averageRating = Number(mentorProfile.averageRating) || 0;
    dto.totalSessions = mentorProfile.totalSessions || 0;
    dto.profileCompleteness = mentorProfile.profileCompleteness || 0;
    dto.isVerified = mentorProfile.isVerified || false;
    dto.profileType = 'MENTOR';
    dto.joinDate = user.createdAt;
    return dto;
  }

  /**
   * Build public mentee profile DTO
   */
  private buildPublicMenteeProfile(user: User, menteeProfile: MenteeProfile): PublicMenteeProfileDto {
    const dto = new PublicMenteeProfileDto();
    dto.userId = user.id;
    dto.displayName = user.displayName;
    dto.avatarUrl = user.avatarUrl;
    dto.learningGoals = menteeProfile.learningGoals;
    dto.areasOfInterest = menteeProfile.areasOfInterest;
    dto.currentSkillLevel = menteeProfile.currentSkillLevel;
    dto.profileCompleteness = menteeProfile.profileCompleteness || 0;
    dto.profileType = 'MENTEE';
    dto.joinDate = user.createdAt;
    return dto;
  }

  /**
   * Invalidate cache for a user profile
   * Called when profile is updated
   */
  async invalidateCache(userId: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${userId}`;
    await this.redisService.del(cacheKey);
  }

  /**
   * Get cached profile from Redis
   */
  private async getCachedProfile(cacheKey: string): Promise<PublicProfileResponse | null> {
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      // Redis errors should not break the application
      console.error(`Error retrieving cache for ${cacheKey}:`, error);
    }
    return null;
  }

  /**
   * Set profile in Redis cache
   */
  private async setCachedProfile(cacheKey: string, profile: PublicProfileResponse): Promise<void> {
    try {
      await this.redisService.set(cacheKey, JSON.stringify(profile), this.CACHE_TTL_SECONDS);
    } catch (error) {
      // Redis errors should not break the application
      console.error(`Error setting cache for ${cacheKey}:`, error);
    }
  }
}
