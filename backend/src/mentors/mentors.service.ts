import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { MentorProfile } from '../users/entities/mentor-profile.entity.js';
import {
  MentorFeatureAuditAction,
  MentorFeatureAuditLog,
} from './entities/mentor-feature-audit-log.entity.js';
import { FeatureMentorDto } from './dto/mentor-feature.dto.js';
import {
  PaginatedResponse,
  PaginationService,
} from '../common/pagination/index.js';

const DEFAULT_MAX_FEATURED = 10;
const DEFAULT_FEATURED_DURATION_DAYS = 30;

/**
 * #1005: Admin-curated "featured mentor" placement, shown on the homepage
 * and discovery sections. Featured status auto-expires (lazily, on read)
 * after a configurable duration.
 */
@Injectable()
export class MentorsService {
  private readonly maxFeatured: number;
  private readonly featuredDurationDays: number;

  constructor(
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepo: Repository<MentorProfile>,
    @InjectRepository(MentorFeatureAuditLog)
    private readonly auditRepo: Repository<MentorFeatureAuditLog>,
    private readonly paginationService: PaginationService,
    private readonly configService: ConfigService,
  ) {
    this.maxFeatured = this.configService.get<number>(
      'FEATURED_MENTORS_MAX',
      DEFAULT_MAX_FEATURED,
    );
    this.featuredDurationDays = this.configService.get<number>(
      'FEATURED_MENTORS_DURATION_DAYS',
      DEFAULT_FEATURED_DURATION_DAYS,
    );
  }

  async featureMentor(
    mentorId: string,
    adminId: string,
    dto: FeatureMentorDto,
  ): Promise<MentorProfile> {
    const profile = await this.mentorProfileRepo.findOne({
      where: { userId: mentorId },
    });
    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    if (!profile.isFeatured) {
      const activeCount = await this.countActiveFeatured();
      if (activeCount >= this.maxFeatured) {
        throw new BadRequestException(
          `Cannot feature more than ${this.maxFeatured} mentors at once`,
        );
      }
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + this.featuredDurationDays);

    profile.isFeatured = true;
    profile.featuredAt = now;
    profile.featuredExpiresAt = expiresAt;
    profile.featuredOrder =
      dto.featuredOrder ?? (await this.nextFeaturedOrder());

    const saved = await this.mentorProfileRepo.save(profile);

    await this.writeAudit(
      mentorId,
      adminId,
      MentorFeatureAuditAction.FEATURED,
      {
        featuredOrder: saved.featuredOrder,
        featuredExpiresAt: saved.featuredExpiresAt,
      },
    );

    return saved;
  }

  async unfeatureMentor(
    mentorId: string,
    adminId: string,
  ): Promise<MentorProfile> {
    const profile = await this.mentorProfileRepo.findOne({
      where: { userId: mentorId },
    });
    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }
    if (!profile.isFeatured) {
      throw new BadRequestException('Mentor is not currently featured');
    }

    profile.isFeatured = false;
    profile.featuredAt = null;
    profile.featuredExpiresAt = null;
    profile.featuredOrder = 0;

    const saved = await this.mentorProfileRepo.save(profile);

    await this.writeAudit(
      mentorId,
      adminId,
      MentorFeatureAuditAction.UNFEATURED,
      {},
    );

    return saved;
  }

  async getFeaturedMentors(
    page?: number,
    limit?: number,
  ): Promise<PaginatedResponse<MentorProfile>> {
    const qb = this.activeFeaturedQuery()
      .leftJoinAndSelect('profile.user', 'user')
      .orderBy('profile.featuredOrder', 'ASC');

    return this.paginationService.paginate(qb, page, limit);
  }

  private activeFeaturedQuery() {
    return this.mentorProfileRepo
      .createQueryBuilder('profile')
      .where('profile.isFeatured = true')
      .andWhere(
        '(profile.featuredExpiresAt IS NULL OR profile.featuredExpiresAt > :now)',
        { now: new Date() },
      );
  }

  private async countActiveFeatured(): Promise<number> {
    return this.activeFeaturedQuery().getCount();
  }

  private async nextFeaturedOrder(): Promise<number> {
    const { max } = (await this.mentorProfileRepo
      .createQueryBuilder('profile')
      .select('MAX(profile.featuredOrder)', 'max')
      .where('profile.isFeatured = true')
      .getRawOne<{ max: string | null }>()) ?? { max: null };

    return (Number(max) || 0) + 1;
  }

  private async writeAudit(
    mentorId: string,
    adminId: string | null,
    action: MentorFeatureAuditAction,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const log = this.auditRepo.create({ mentorId, adminId, action, metadata });
    await this.auditRepo.save(log);
  }
}
