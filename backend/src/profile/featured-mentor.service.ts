import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import {
  BusinessRuleException,
  ResourceNotFoundException,
} from '../common/errors/app-exceptions';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { ChangeReason } from '../profile-history/profile-history.entity';
import { ProfileHistoryService } from '../profile-history/profile-history.service';
import { MentorProfile } from './mentor-profile.entity';
import { FeaturedMentorDto } from './dto/featured-mentor.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Manages the curated "Featured mentors" list: capacity limits, manual
 * ordering, automatic expiry after a configurable duration, and audit history.
 */
@Injectable()
export class FeaturedMentorService {
  private readonly audit = new Logger('FeaturedMentorAudit');

  constructor(
    @InjectRepository(MentorProfile)
    private readonly mentors: Repository<MentorProfile>,
    private readonly dataSource: DataSource,
    private readonly history: ProfileHistoryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Public, paginated list used by the homepage and discovery sections. */
  async getFeaturedMentors(query: { page?: number; limit?: number } = {}): Promise<{
    data: FeaturedMentorDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    await this.expireStaleFeatures();

    const [rows, total] = await this.mentors.findAndCount({
      where: { isFeatured: true },
      relations: { user: true },
      order: { featuredOrder: 'ASC', featuredAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows.map(FeaturedMentorDto.fromEntity),
      total,
      page,
      limit,
    };
  }

  /** Admin action: puts a mentor in the featured list and assigns a sort slot. */
  async featureMentor(
    mentorId: string,
    adminAddress: string,
    requestedOrder?: number,
  ): Promise<FeaturedMentorDto> {
    await this.expireStaleFeatures();
    const now = new Date();

    const profile = await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(MentorProfile, {
        where: { id: mentorId },
        relations: { user: true },
      });
      if (!existing) {
        throw new ResourceNotFoundException('Mentor profile', mentorId);
      }

      if (existing.isFeatured) {
        // Refreshing a featured mentor keeps its slot unless one was requested.
        const order = requestedOrder ?? existing.featuredOrder ?? (await this.nextOrder(manager));
        if (requestedOrder !== undefined && requestedOrder !== existing.featuredOrder) {
          await this.shiftOrders(manager, requestedOrder);
        }
        await manager.update(MentorProfile, existing.id, {
          featuredAt: now,
          featuredOrder: order,
        });
        await this.recordAudit(existing, adminAddress, now, 'refresh');
        return {
          ...existing,
          featuredAt: now,
          featuredOrder: order,
          isFeatured: true,
        } as MentorProfile;
      }

      const currentCount = await manager.count(MentorProfile, {
        where: { isFeatured: true },
      });
      if (currentCount >= this.config.featuredMentors.max) {
        throw new BusinessRuleException(
          `The featured mentors list is full (maximum ${this.config.featuredMentors.max}). ` +
            'Unfeature another mentor before adding this one.',
        );
      }

      const order = requestedOrder ?? (await this.nextOrder(manager));
      await this.shiftOrders(manager, order);
      await manager.update(MentorProfile, existing.id, {
        isFeatured: true,
        featuredAt: now,
        featuredOrder: order,
      });
      await this.recordAudit(existing, adminAddress, now, 'feature');
      return {
        ...existing,
        isFeatured: true,
        featuredAt: now,
        featuredOrder: order,
      } as MentorProfile;
    });

    this.audit.log(
      `mentor_featured mentor=${mentorId} actor=${adminAddress} order=${profile.featuredOrder}`,
    );
    return FeaturedMentorDto.fromEntity(profile);
  }

  /** Admin action: removes a mentor from the list and compacts the ordering. */
  async unfeatureMentor(
    mentorId: string,
    adminAddress: string,
  ): Promise<{ walletAddress: string; isFeatured: false }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(MentorProfile, {
        where: { id: mentorId },
      });
      if (!existing) {
        throw new ResourceNotFoundException('Mentor profile', mentorId);
      }
      const now = new Date();
      await manager.update(MentorProfile, existing.id, {
        isFeatured: false,
        featuredAt: null,
        featuredOrder: null,
      });
      if (existing.featuredOrder !== null) {
        await manager
          .createQueryBuilder()
          .update(MentorProfile)
          .set({ featuredOrder: () => 'featured_order - 1' })
          .where('is_featured = :isFeatured AND featured_order > :order', {
            isFeatured: true,
            order: existing.featuredOrder,
          })
          .execute();
      }
      await this.recordAudit(existing, adminAddress, now, 'unfeature');
      return { walletAddress: existing.walletAddress, isFeatured: false as const };
    });

    this.audit.log(`mentor_unfeatured mentor=${mentorId} actor=${adminAddress}`);
    return result;
  }

  /** True while the profile has an unexpired feature flag. */
  isFeatureActive(profile: MentorProfile, now = new Date()): boolean {
    if (!profile.isFeatured || !profile.featuredAt) return false;
    const expiresAt =
      profile.featuredAt.getTime() + this.config.featuredMentors.durationDays * DAY_MS;
    return expiresAt > now.getTime();
  }

  /** Clears features older than the configured duration. */
  private async expireStaleFeatures(): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.config.featuredMentors.durationDays * DAY_MS,
    );
    const result = await this.mentorRepo.update(
      { isFeatured: true, featuredAt: LessThan(cutoff) },
      { isFeatured: false, featuredAt: null, featuredOrder: null },
    );
    if (result.affected && result.affected > 0) {
      this.audit.log(`featured_mentors_expired count=${result.affected}`);
    }
  }

  private async nextOrder(manager: EntityManager): Promise<number> {
    const row = await manager
      .createQueryBuilder(MentorProfile, 'mentor')
      .select('MAX(mentor.featuredOrder)', 'max')
      .where('mentor.is_featured = :isFeatured', { isFeatured: true })
      .getRawOne<{ max: number | null }>();
    return (row?.max ?? 0) + 1;
  }

  /** Makes room at `order` by moving existing entries one slot down. */
  private async shiftOrders(manager: EntityManager, order: number): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(MentorProfile)
      .set({ featuredOrder: () => 'featured_order + 1' })
      .where('is_featured = :isFeatured AND featured_order >= :order', {
        isFeatured: true,
        order,
      })
      .execute();
  }

  private async recordAudit(
    profile: MentorProfile,
    adminAddress: string,
    changedAt: Date,
    action: 'feature' | 'refresh' | 'unfeature',
  ): Promise<void> {
    const featured = action !== 'unfeature';
    await this.history.recordMany([
      {
        userId: profile.walletAddress,
        profileType: 'mentor',
        fieldName: 'isFeatured',
        oldValue: profile.isFeatured,
        newValue: featured,
        changedBy: adminAddress,
        changeReason: ChangeReason.ADMIN_EDIT,
        changedAt,
      },
      {
        userId: profile.walletAddress,
        profileType: 'mentor',
        fieldName: 'featuredAt',
        oldValue: profile.featuredAt,
        newValue: featured ? changedAt : null,
        changedBy: adminAddress,
        changeReason: ChangeReason.ADMIN_EDIT,
        changedAt,
      },
      {
        userId: profile.walletAddress,
        profileType: 'mentor',
        fieldName: 'featuredOrder',
        oldValue: profile.featuredOrder,
        newValue: null,
        changedBy: adminAddress,
        changeReason: ChangeReason.ADMIN_EDIT,
        changedAt,
      },
    ]);
  }
}
