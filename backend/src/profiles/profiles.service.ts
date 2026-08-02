import { Injectable, NotFoundException } from '@nestjs/common';
import { RedisService } from '../config/redis.module.js';
import { UsersService } from '../users/users.service.js';
import { User } from '../users/entities/user.entity.js';
import { PublicProfileResponseDto } from './dto/public-profile-response.dto.js';

const CACHE_PREFIX = 'public-profile:';
const CACHE_TTL_SECONDS = 300;

@Injectable()
export class ProfilesService {
  constructor(
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
  ) {}

  async getPublicProfile(userId: string): Promise<PublicProfileResponseDto> {
    const cacheKey = `${CACHE_PREFIX}${userId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as PublicProfileResponseDto;
    }

    const user = await this.usersService.findById(userId).catch(() => null);
    if (!user) {
      throw new NotFoundException('Profile not found');
    }

    let profile: PublicProfileResponseDto;
    if (user.mentorProfile) {
      profile = this.buildMentorProfile(user);
    } else if (user.menteeProfile) {
      profile = this.buildMenteeProfile(user);
    } else {
      throw new NotFoundException('Profile not found');
    }

    await this.redisService.set(
      cacheKey,
      JSON.stringify(profile),
      CACHE_TTL_SECONDS,
    );

    return profile;
  }

  private buildMentorProfile(user: User): PublicProfileResponseDto {
    const mentorProfile = user.mentorProfile;
    return {
      userId: user.id,
      profileType: 'mentor',
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      isVerified: mentorProfile.isVerified,
      profileCompletion: mentorProfile.profileCompletion,
      bio: mentorProfile.bio ?? null,
      skills: mentorProfile.skills,
      hourlyRate: Number(mentorProfile.hourlyRate),
      expertiseAreas: mentorProfile.expertiseAreas,
      averageRating: Number(mentorProfile.averageRating),
      totalMentoringHours: mentorProfile.totalMentoringHours,
    };
  }

  private buildMenteeProfile(user: User): PublicProfileResponseDto {
    const menteeProfile = user.menteeProfile;
    return {
      userId: user.id,
      profileType: 'mentee',
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      isVerified: false,
      profileCompletion: menteeProfile.profileCompletion,
      goals: menteeProfile.learningGoals,
      interests: menteeProfile.areasOfInterest,
      joinedAt: user.createdAt,
    };
  }
}
