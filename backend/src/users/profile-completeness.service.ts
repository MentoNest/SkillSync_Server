import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { MentorProfile } from './entities/mentor-profile.entity.js';
import { MenteeProfile } from './entities/mentee-profile.entity.js';
import { PortfolioLink } from './entities/portfolio-link.entity.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { RedisService } from '../config/redis.module.js';
import { PaginationService } from '../common/pagination/index.js';
import {
  MissingField,
  ProfileCompletenessResponseDto,
  UserCompletenessSummary,
} from './dto/profile-completeness-response.dto.js';

const CACHE_TTL_SECONDS = 300;
const LOW_SCORE_THRESHOLD = 80;
const MAX_BONUS_PERCENT = 10;

interface FieldCheck {
  field: string;
  description: string;
  filled: boolean;
}

/**
 * #1004: Computes a dynamic profile-completion score (0-110) per profile
 * type, with a short-lived cache to avoid recomputing on every request.
 */
@Injectable()
export class ProfileCompletenessService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepo: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly menteeProfileRepo: Repository<MenteeProfile>,
    @InjectRepository(PortfolioLink)
    private readonly portfolioLinkRepo: Repository<PortfolioLink>,
    private readonly availabilityService: AvailabilityService,
    private readonly redisService: RedisService,
    private readonly paginationService: PaginationService,
  ) {}

  async getCompleteness(
    userId: string,
  ): Promise<ProfileCompletenessResponseDto> {
    const cacheKey = this.cacheKey(userId);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ProfileCompletenessResponseDto;
    }

    const result = await this.compute(userId);
    await this.redisService.set(
      cacheKey,
      JSON.stringify(result),
      CACHE_TTL_SECONDS,
    );
    return result;
  }

  /** Invalidate the cached score, e.g. after a profile update. */
  async invalidate(userId: string): Promise<void> {
    await this.redisService.del(this.cacheKey(userId));
  }

  /** Admin view: paginated completeness scores across all users with a profile. */
  async getAllCompletenessScores(
    page?: number,
    limit?: number,
  ): Promise<{ data: UserCompletenessSummary[]; meta: unknown }> {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoin('user.mentorProfile', 'mentorProfile')
      .leftJoin('user.menteeProfile', 'menteeProfile')
      .where('mentorProfile.id IS NOT NULL OR menteeProfile.id IS NOT NULL')
      .orderBy('user.createdAt', 'DESC');

    const paginated = await this.paginationService.paginate(qb, page, limit);

    const data = await Promise.all(
      paginated.data.map(async (user) => ({
        userId: user.id,
        ...(await this.getCompleteness(user.id)),
      })),
    );

    return { data, meta: paginated.meta };
  }

  private cacheKey(userId: string): string {
    return `profile-completeness:${userId}`;
  }

  private async compute(
    userId: string,
  ): Promise<ProfileCompletenessResponseDto> {
    const [user, mentorProfile, menteeProfile] = await Promise.all([
      this.userRepo.findOne({ where: { id: userId } }),
      this.mentorProfileRepo.findOne({ where: { userId } }),
      this.menteeProfileRepo.findOne({ where: { userId } }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (mentorProfile) {
      return this.computeMentorCompleteness(user, mentorProfile);
    }
    if (menteeProfile) {
      return this.computeMenteeCompleteness(menteeProfile);
    }

    throw new NotFoundException(
      'No mentor or mentee profile found for this user',
    );
  }

  private async computeMentorCompleteness(
    user: User,
    profile: MentorProfile,
  ): Promise<ProfileCompletenessResponseDto> {
    const [slots, portfolioLinksCount] = await Promise.all([
      this.availabilityService.getSlots(user.id),
      this.portfolioLinkRepo.count({ where: { userId: user.id } }),
    ]);

    const required: FieldCheck[] = [
      {
        field: 'bio',
        description: 'Add a short bio describing your mentoring background',
        filled: !!profile.bio,
      },
      {
        field: 'skills',
        description: 'List at least one skill you can mentor in',
        filled: (profile.skills?.length ?? 0) > 0,
      },
      {
        field: 'hourlyRate',
        description: 'Set your hourly rate',
        filled: Number(profile.hourlyRate) > 0,
      },
      {
        field: 'expertiseAreas',
        description: 'Add at least one area of expertise',
        filled: (profile.expertiseAreas?.length ?? 0) > 0,
      },
      {
        field: 'avatar',
        description: 'Upload a profile photo',
        filled: !!user.avatarUrl,
      },
      {
        field: 'availabilitySlots',
        description:
          'Add at least one availability slot so mentees can book you',
        filled: slots.length > 0,
      },
    ];

    const optional: FieldCheck[] = [
      {
        field: 'portfolioLinks',
        description:
          'Add a portfolio link (GitHub, LinkedIn, personal site, etc.)',
        filled: portfolioLinksCount > 0,
      },
      {
        field: 'education',
        description: 'Add your education history',
        filled: (profile.education?.length ?? 0) > 0,
      },
      {
        field: 'certifications',
        description: 'Add any relevant certifications',
        filled: (profile.certifications?.length ?? 0) > 0,
      },
    ];

    return this.buildResponse('mentor', required, optional);
  }

  private computeMenteeCompleteness(
    profile: MenteeProfile,
  ): ProfileCompletenessResponseDto {
    const required: FieldCheck[] = [
      {
        field: 'learningGoals',
        description: 'Add at least one learning goal',
        filled: (profile.learningGoals?.length ?? 0) > 0,
      },
      {
        field: 'currentSkillLevel',
        description: 'Set your current skill level',
        filled: !!profile.currentSkillLevel,
      },
      {
        field: 'areasOfInterest',
        description: 'Add at least one area of interest',
        filled: (profile.areasOfInterest?.length ?? 0) > 0,
      },
    ];

    const optional: FieldCheck[] = [
      {
        field: 'portfolioLinks',
        description: 'Add a portfolio link to showcase your work',
        filled: (profile.portfolioLinks?.length ?? 0) > 0,
      },
      {
        field: 'professionalBackground',
        description: 'Describe your professional background',
        filled: !!profile.professionalBackground,
      },
      {
        field: 'jobTitle',
        description: 'Add your current job title',
        filled: !!profile.jobTitle,
      },
    ];

    return this.buildResponse('mentee', required, optional);
  }

  private buildResponse(
    profileType: 'mentor' | 'mentee',
    required: FieldCheck[],
    optional: FieldCheck[],
  ): ProfileCompletenessResponseDto {
    const filledRequired = required.filter((f) => f.filled).length;
    const baseScore = Math.round((filledRequired / required.length) * 100);

    const filledOptional = optional.filter((f) => f.filled).length;
    const bonus =
      optional.length > 0
        ? Math.round((filledOptional / optional.length) * MAX_BONUS_PERCENT)
        : 0;

    const score = Math.min(baseScore + bonus, 100 + MAX_BONUS_PERCENT);

    const missingFields: MissingField[] = required
      .filter((f) => !f.filled)
      .map(({ field, description }) => ({ field, description }));

    const suggestions =
      baseScore < LOW_SCORE_THRESHOLD
        ? missingFields.map((f) => `Complete "${f.field}": ${f.description}`)
        : [];

    return { score, profileType, missingFields, suggestions };
  }
}
