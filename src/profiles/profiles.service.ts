import { Injectable } from '@nestjs/common';
import { UserRepository } from '../user/user.repository';
import { RedisService } from '../cache/redis.service';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly redisService: RedisService,
  ) {}

  async getPublicProfile(userId: string) {
    const cacheKey = `public_profile:${userId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const user = await this.userRepository.findById(userId);
    if (!user) return null;

    let profile: any = {
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      profileType: user.profileType, // 'mentor' or 'mentee'
      isVerified: user.isVerified,
    };

    if (user.profileType === 'mentor') {
      profile = {
        ...profile,
        bio: user.bio,
        skills: user.skills,
        hourlyRate: user.hourlyRate,
        expertise: user.expertise,
        averageRating: user.averageRating,
        totalSessions: user.totalSessions,
        verificationBadge: user.isVerified ? '✔️' : null,
      };
    } else if (user.profileType === 'mentee') {
      profile = {
        ...profile,
        goals: user.goals,
        interests: user.interests,
        joinDate: user.joinDate,
      };
    }

    // Optional: profile completeness badge
    profile.completenessBadge = this.calculateCompleteness(user);

    // Cache for 5 minutes
    await this.redisService.set(cacheKey, JSON.stringify(profile), 300);

    return profile;
  }

  private calculateCompleteness(user: any): string {
    let score = 0;
    if (user.avatarUrl) score += 20;
    if (user.bio) score += 20;
    if (user.skills?.length) score += 20;
    if (user.goals) score += 20;
    if (user.interests?.length) score += 20;
    return score >= 80 ? 'High' : score >= 50 ? 'Medium' : 'Low';
  }
}
