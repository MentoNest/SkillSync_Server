import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { PaginationService } from '../../common/pagination/pagination.service';
import type { PaginatedResponse } from '../../common/pagination/types/pagination.types';
import { REDIS } from '../../redis/redis.module';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';
import { FeaturedMentorDto, FeaturedMentorQueryDto, ReorderFeaturedMentorsDto } from './dto/featured-mentor.dto';

export const DEFAULT_MAX_FEATURED = 10;
export const DEFAULT_FEATURED_TTL_DAYS = 30;
export const FEATURED_CACHE_TTL_SECONDS = 300;
const FEATURED_CACHE_PREFIX = 'mentors:featured';

/**
 * Homepage/discovery spotlight for mentors (#1459).
 *
 * Three rules shape the implementation:
 * - the number of live featured mentors is capped, so the homepage slot cannot
 *   be flooded;
 * - a feature expires on its own after a configurable TTL, so a stale
 *   promotion cannot sit at the top of the page forever;
 * - ordering is an explicit integer the admin UI can rewrite wholesale rather
 *   than a timestamp, which makes drag-and-drop reordering a single UPDATE.
 */
@Injectable()
export class FeaturedMentorService {
  private readonly logger = new Logger(FeaturedMentorService.name);
  private readonly maxFeatured: number;
  private readonly ttlDays: number;

  constructor(
    @InjectRepository(MentorProfile) private readonly profiles: Repository<MentorProfile>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly pagination: PaginationService,
    private readonly audit: AuditService,
    @Optional() private readonly redis?: Redis,
    @Optional() config?: ConfigService,
  ) {
    const configuredMax = parseInt(config?.get<string>('MAX_FEATURED_MENTORS') ?? '', 10);
    this.maxFeatured = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : DEFAULT_MAX_FEATURED;

    const configuredTtl = parseInt(config?.get<string>('FEATURED_MENTOR_TTL_DAYS') ?? '', 10);
    this.ttlDays = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : DEFAULT_FEATURED_TTL_DAYS;
  }

  /**
   * Marks a mentor as featured and appends them to the end of the order.
   * Rejects a mentor whose feature is still live, so a double-click cannot
   * create two entries; a lapsed mentor may be featured again.
   */
  async feature(mentorUserId: string, adminId?: string): Promise<FeaturedMentorDto> {
    const profile = await this.requireProfile(mentorUserId);

    if (this.isLive(profile)) {
      throw new ConflictException('Mentor is already featured');
    }

    const liveCount = await this.countLive();
    if (liveCount >= this.maxFeatured) {
      throw new BadRequestException(
        `At most ${this.maxFeatured} mentors can be featured at once. Unfeature one first.`,
      );
    }

    profile.isFeatured = true;
    profile.featuredAt = new Date();
    profile.featuredOrder = await this.nextOrder();
    const saved = await this.profiles.save(profile);

    await this.audit.record({
      event: AuditEvent.MENTOR_FEATURED,
      userId: adminId ?? null,
      metadata: { mentorUserId, featuredOrder: saved.featuredOrder, expiresAt: this.expiryFor(saved) },
    });
    await this.invalidate();

    return this.toDto(saved);
  }

  /**
   * Clears the spotlight. Rejects a mentor who is not currently featured, so a
   * caller gets a clear signal instead of a silent no-op — including when the
   * feature has lapsed, which admins still need to be able to clear.
   */
  async unfeature(mentorUserId: string, adminId?: string): Promise<FeaturedMentorDto> {
    const profile = await this.requireProfile(mentorUserId);

    if (!profile.isFeatured) {
      throw new ConflictException('Mentor is not currently featured');
    }

    profile.isFeatured = false;
    profile.featuredAt = null;
    const saved = await this.profiles.save(profile);

    await this.audit.record({
      event: AuditEvent.MENTOR_UNFEATURED,
      userId: adminId ?? null,
      metadata: { mentorUserId },
    });
    await this.invalidate();

    return this.toDto(saved);
  }

  /** Public paginated listing, ordered by the manual `featuredOrder`. */
  async listFeatured(query: FeaturedMentorQueryDto): Promise<PaginatedResponse<FeaturedMentorDto>> {
    const qb = this.profiles
      .createQueryBuilder('mentor')
      .leftJoinAndSelect('mentor.user', 'user')
      .where('mentor.isFeatured = true')
      .andWhere('mentor.featuredAt >= :cutoff', { cutoff: this.cutoff() });

    if (query.verifiedOnly) {
      qb.andWhere('mentor.isVerified = true');
    }
    if (query.minRating !== undefined) {
      qb.andWhere('mentor.averageRating >= :minRating', { minRating: query.minRating });
    }

    qb.orderBy('mentor.featuredOrder', 'ASC').addOrderBy('mentor.featuredAt', 'DESC');

    const page = await this.pagination.paginate(qb, query.page, query.limit, { links: false });
    return { ...page, data: page.data.map((p) => this.toDto(p)) };
  }

  /**
   * Rewrites the whole display order from the admin drag-and-drop UI (#1459).
   * Unknown ids are rejected so a stale UI cannot silently drop a mentor.
   */
  async reorder(dto: ReorderFeaturedMentorsDto, adminId?: string): Promise<FeaturedMentorDto[]> {
    const order = dto.order ?? [];
    if (order.length === 0) {
      throw new BadRequestException('order must contain at least one mentor id');
    }
    if (order.length > this.maxFeatured) {
      throw new BadRequestException(`At most ${this.maxFeatured} mentors can be featured at once`);
    }

    const profiles = await this.profiles.find({ where: { userId: In(order) } });
    const byUserId = new Map(profiles.map((p) => [p.userId, p]));

    const missing = order.filter((id) => !byUserId.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Unknown mentor id(s): ${missing.join(', ')}`);
    }

    order.forEach((userId, index) => {
      const profile = byUserId.get(userId)!;
      profile.isFeatured = true;
      profile.featuredOrder = index;
      if (!profile.featuredAt) profile.featuredAt = new Date();
    });

    const saved = await this.profiles.save(profiles);
    await this.audit.record({
      event: AuditEvent.MENTOR_FEATURE_REORDERED,
      userId: adminId ?? null,
      metadata: { reordered: order, count: order.length },
    });
    await this.invalidate();

    return saved
      .map((p) => this.toDto(p))
      .sort((a, b) => a.featuredOrder - b.featuredOrder);
  }

  /** Number of mentors whose feature has not lapsed. */
  async countLive(): Promise<number> {
    return this.profiles
      .createQueryBuilder('mentor')
      .where('mentor.isFeatured = true')
      .andWhere('mentor.featuredAt >= :cutoff', { cutoff: this.cutoff() })
      .getCount();
  }

  /** Lapses any feature whose `featuredAt` is at or before the TTL cutoff (#1459). */
  async expireStale(): Promise<number> {
    const result = await this.profiles.update(
      { isFeatured: true, featuredAt: LessThanOrEqual(this.cutoff()) },
      { isFeatured: false, featuredAt: null },
    );
    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.log(`Expired ${affected} featured mentor spot(s) older than ${this.ttlDays} days`);
      await this.invalidate();
    }
    return affected;
  }

  /** Exposed for tests and for the public badge to agree on expiry. */
  isLive(profile: Pick<MentorProfile, 'isFeatured' | 'featuredAt'>): boolean {
    if (!profile.isFeatured) return false;
    if (!profile.featuredAt) return false;
    return profile.featuredAt.getTime() >= this.cutoff().getTime();
  }

  private expiryFor(profile: MentorProfile): string {
    const base = profile.featuredAt ? new Date(profile.featuredAt) : new Date();
    return new Date(base.getTime() + this.ttlDays * 86_400_000).toISOString();
  }

  private cutoff(): Date {
    return new Date(Date.now() - this.ttlDays * 86_400_000);
  }

  private async nextOrder(): Promise<number> {
    const highest = await this.profiles
      .createQueryBuilder('mentor')
      .select('MAX(mentor.featuredOrder)', 'max')
      .where('mentor.isFeatured = true')
      .getRawOne<{ max: string | null }>();
    const max = highest?.max === null || highest?.max === undefined ? 0 : Number(highest.max);
    return (Number.isFinite(max) ? max : 0) + 1;
  }

  private async requireProfile(mentorUserId: string): Promise<MentorProfile> {
    const profile = await this.profiles.findOne({ where: { userId: mentorUserId } });
    if (!profile) {
      throw new NotFoundException(`Mentor profile for user ${mentorUserId} was not found`);
    }
    return profile;
  }

  private toDto(profile: MentorProfile): FeaturedMentorDto {
    const user = profile.user;
    return {
      userId: profile.userId,
      displayName: user?.displayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      bio: profile.bio ?? null,
      skills: profile.skills ?? [],
      expertiseAreas: profile.expertiseAreas ?? [],
      averageRating: Number(profile.averageRating),
      reviewCount: profile.reviewCount,
      hourlyRate: Number(profile.hourlyRate),
      isVerified: profile.isVerified,
      isFeatured: true,
      featuredAt: profile.featuredAt,
      featuredOrder: profile.featuredOrder,
    };
  }

  /** Best-effort cache invalidation; never fails the request. */
  private async invalidate(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(`${FEATURED_CACHE_PREFIX}:${FEATURED_CACHE_TTL_SECONDS}`);
    } catch {
      // cache is best-effort
    }
  }
}