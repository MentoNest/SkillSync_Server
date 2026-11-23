import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilitySlot } from '../availability/availability-slot.entity';
import { ResourceNotFoundException } from '../common/errors/app-exceptions';
import { APP_CONFIG } from '../config/app.config';
import type { AppConfig } from '../config/app.config';
import { RedisNamespace } from '../redis/redis.config';
import { RedisService } from '../redis/redis.service';
import { PortfolioLink } from '../user/portfolio-link.entity';
import { User } from '../user/user.entity';
import {
  calculateProfileCompleteness,
  CompletenessInput,
  CompletenessResult,
} from './profile-completeness.calculator';
import { ProfileCompletenessDto } from './dto/profile-completeness.dto';

export interface CachedCompleteness extends CompletenessResult {
  cached?: boolean;
  walletAddress?: string;
}

/** Computes and caches profile completion percentages. Scores are never stored. */
@Injectable()
export class ProfileCompletenessService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(AvailabilitySlot)
    private readonly slots: Repository<AvailabilitySlot>,
    @InjectRepository(PortfolioLink)
    private readonly portfolioLinks: Repository<PortfolioLink>,
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** GET /user/profile/completeness — cached for five minutes by default. */
  async getForUser(walletAddress: string): Promise<CachedCompleteness> {
    const key = this.cacheKey(walletAddress);
    const cached = await this.redis.get(RedisNamespace.CACHE, key);
    if (cached) {
      try {
        return { ...(JSON.parse(cached) as CompletenessResult), cached: true };
      } catch {
        // A corrupt cache entry must never break the endpoint.
        await this.invalidate(walletAddress);
      }
    }

    const result = await this.computeForUser(walletAddress);
    await this.redis.set(
      RedisNamespace.CACHE,
      key,
      JSON.stringify(result),
      this.config.profileCompleteness.cacheTtlSeconds,
    );
    return { ...result, cached: false };
  }

  /** Admin view of every user's score, paginated. */
  async getAll(query: { page?: number; limit?: number } = {}): Promise<{
    data: ProfileCompletenessDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [users, total] = await this.users.findAndCount({
      select: { walletAddress: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = await Promise.all(
      users.map(async (user) => ({
        ...(await this.getForUser(user.walletAddress)),
        walletAddress: user.walletAddress,
      })),
    );
    return { data, total, page, limit };
  }

  /** Call after any profile/user change so clients see the new score immediately. */
  async invalidate(walletAddress: string): Promise<void> {
    await this.redis.del(RedisNamespace.CACHE, this.cacheKey(walletAddress));
  }

  /** Derives the score directly from the database; used by the cache and tests. */
  async computeForUser(walletAddress: string): Promise<CompletenessResult> {
    const [user, availabilitySlotCount, portfolioLinkCount] = await Promise.all([
      this.users.findOne({
        where: { walletAddress },
        relations: { mentorProfile: true, menteeProfile: true },
      }),
      this.slots.count({ where: { mentorId: walletAddress } }),
      this.portfolioLinks.count({ where: { walletAddress } }),
    ]);
    if (!user) throw new ResourceNotFoundException('User', walletAddress);

    const profileType = user.mentorProfile ? 'mentor' : 'mentee';
    const input: CompletenessInput = {
      profileType,
      profile: user.mentorProfile ?? user.menteeProfile ?? null,
      user: {
        avatarUrl: user.avatarUrl,
        education: user.education,
        certifications: user.certifications,
      },
      availabilitySlotCount,
      portfolioLinkCount,
    };
    return calculateProfileCompleteness(
      input,
      this.config.profileCompleteness.minimumSuggestionScore,
    );
  }

  private cacheKey(walletAddress: string): string {
    return `completeness:${walletAddress}`;
  }
}
