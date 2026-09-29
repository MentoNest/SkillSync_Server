import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MentorProfile } from '../entities/mentor-profile.entity.js';
import { AuditService } from '../audit/audit.service.js';

export interface FeatureMentorOptions {
  /** Manual position in the featured list. If omitted, appended at end. */
  featuredOrder?: number;
}

export interface FeaturedMentorResult {
  mentorId: string;
  userId: string;
  isFeatured: boolean;
  featuredAt: Date | null;
  featuredOrder: number | null;
}

/**
 * #1346: Business logic for featuring / unfeaturing mentors.
 *
 * Maximum featured limit and auto-expiry duration are configurable via
 * environment variables:
 *   FEATURED_MENTOR_MAX_COUNT   (default: 10)
 *   FEATURED_MENTOR_EXPIRY_DAYS (default: 30)
 */
@Injectable()
export class FeaturedMentorService {
  private readonly logger = new Logger(FeaturedMentorService.name);

  private get maxFeaturedCount(): number {
    const configured = parseInt(process.env.FEATURED_MENTOR_MAX_COUNT || '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 10;
  }

  private get expiryDays(): number {
    const configured = parseInt(process.env.FEATURED_MENTOR_EXPIRY_DAYS || '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 30;
  }

  constructor(
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepository: Repository<MentorProfile>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Returns all currently featured (and not-yet-expired) mentor profiles,
   * ordered by featuredOrder ASC (nulls last), then featuredAt ASC.
   * Supports pagination.
   */
  async getFeaturedMentors(
    page = 1,
    limit = 20,
  ): Promise<{
    data: FeaturedMentorResult[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Expire stale featured mentors before returning results
    await this.expireStale();

    const skip = (page - 1) * limit;
    const [profiles, total] = await this.mentorProfileRepository
      .createQueryBuilder('mp')
      .where('mp.isFeatured = :featured', { featured: true })
      .orderBy('mp.featuredOrder', 'ASC', 'NULLS LAST')
      .addOrderBy('mp.featuredAt', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: profiles.map((p) => this.toResult(p)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * #1346: Admin action — feature a mentor.
   * Enforces the configurable maximum featured count.
   */
  async featureMentor(
    mentorId: string,
    adminUserId: string,
    options: FeatureMentorOptions = {},
  ): Promise<FeaturedMentorResult> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { id: mentorId },
    });
    if (!profile) {
      throw new NotFoundException(`Mentor profile ${mentorId} not found`);
    }

    if (profile.isFeatured) {
      throw new BadRequestException('This mentor is already featured');
    }

    // Expire stale entries first so they don't count against the limit
    await this.expireStale();

    const currentCount = await this.mentorProfileRepository.count({
      where: { isFeatured: true },
    });
    if (currentCount >= this.maxFeaturedCount) {
      throw new BadRequestException(
        `Maximum featured mentor limit (${this.maxFeaturedCount}) has been reached. Unfeature another mentor first.`,
      );
    }

    profile.isFeatured = true;
    profile.featuredAt = new Date();
    profile.featuredOrder =
      options.featuredOrder !== undefined ? options.featuredOrder : null;

    const saved = await this.mentorProfileRepository.save(profile);

    await this.auditService.log({
      eventType: 'MENTOR_FEATURED',
      userId: adminUserId,
      details: {
        mentorProfileId: mentorId,
        mentorUserId: profile.userId,
        featuredAt: saved.featuredAt,
        featuredOrder: saved.featuredOrder,
      },
    });

    this.logger.log(`Admin ${adminUserId} featured mentor profile ${mentorId}`);

    return this.toResult(saved);
  }

  /**
   * #1346: Admin action — unfeature a mentor.
   */
  async unfeatureMentor(
    mentorId: string,
    adminUserId: string,
  ): Promise<FeaturedMentorResult> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { id: mentorId },
    });
    if (!profile) {
      throw new NotFoundException(`Mentor profile ${mentorId} not found`);
    }

    if (!profile.isFeatured) {
      throw new BadRequestException('This mentor is not currently featured');
    }

    profile.isFeatured = false;
    profile.featuredAt = null;
    profile.featuredOrder = null;

    const saved = await this.mentorProfileRepository.save(profile);

    await this.auditService.log({
      eventType: 'MENTOR_UNFEATURED',
      userId: adminUserId,
      details: {
        mentorProfileId: mentorId,
        mentorUserId: profile.userId,
      },
    });

    this.logger.log(`Admin ${adminUserId} unfeatured mentor profile ${mentorId}`);

    return this.toResult(saved);
  }

  /**
   * Expire featured mentors whose featuredAt + expiryDays < now.
   * Called proactively before reads/writes to keep the list fresh.
   */
  async expireStale(): Promise<void> {
    const cutoff = new Date(Date.now() - this.expiryDays * 24 * 60 * 60 * 1000);

    const stale = await this.mentorProfileRepository
      .createQueryBuilder('mp')
      .where('mp.isFeatured = :featured', { featured: true })
      .andWhere('mp.featuredAt IS NOT NULL')
      .andWhere('mp.featuredAt < :cutoff', { cutoff })
      .getMany();

    if (stale.length === 0) return;

    for (const profile of stale) {
      profile.isFeatured = false;
      profile.featuredAt = null;
      profile.featuredOrder = null;
    }

    await this.mentorProfileRepository.save(stale);
    this.logger.log(`Auto-expired ${stale.length} featured mentor(s)`);
  }

  private toResult(profile: MentorProfile): FeaturedMentorResult {
    return {
      mentorId: profile.id,
      userId: profile.userId,
      isFeatured: profile.isFeatured,
      featuredAt: profile.featuredAt,
      featuredOrder: profile.featuredOrder,
    };
  }
}
