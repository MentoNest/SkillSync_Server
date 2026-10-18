import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Repository, SelectQueryBuilder } from 'typeorm';
import type { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import type { PaginationService } from '../../common/pagination/pagination.service';
import type { MentorProfile } from '../entities/mentor-profile.entity';
import {
  DEFAULT_FEATURED_TTL_DAYS,
  DEFAULT_MAX_FEATURED,
  FeaturedMentorService,
} from './featured-mentor.service';

const ADMIN = 'admin-user-id';

function profile(overrides: Partial<MentorProfile> = {}): MentorProfile {
  return {
    id: 'p1',
    userId: 'mentor-1',
    bio: 'Bio',
    skills: ['ts'],
    expertiseAreas: ['web'],
    averageRating: 4.5,
    reviewCount: 10,
    hourlyRate: 50,
    isVerified: true,
    isFeatured: false,
    featuredAt: null,
    featuredOrder: 0,
    ...overrides,
  } as MentorProfile;
}

function createHarness(options: { maxFeatured?: number; ttlDays?: number; profiles?: MentorProfile[] } = {}) {
  const rows = options.profiles ?? [profile()];

  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
    getRawOne: jest.fn().mockResolvedValue({ max: '0' }),
  };

  const profiles = {
    findOne: jest.fn().mockResolvedValue(rows[0]),
    find: jest.fn().mockResolvedValue(rows),
    save: jest.fn(async (p: MentorProfile | MentorProfile[]) => p),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn(() => qb),
  };

  const pagination = { paginate: jest.fn(async (_qb, page, limit) => ({
    data: rows,
    meta: { page: page ?? 1, limit: limit ?? 20, total: rows.length, totalPages: 1, hasNext: false, hasPrev: false },
  })) };

  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const config = {
    get: (key: string) =>
      ({
        MAX_FEATURED_MENTORS: options.maxFeatured === undefined ? undefined : String(options.maxFeatured),
        FEATURED_MENTOR_TTL_DAYS: options.ttlDays === undefined ? undefined : String(options.ttlDays),
      })[key],
  };

  const service = new FeaturedMentorService(
    profiles as unknown as Repository<MentorProfile>,
    {} as Repository<unknown>,
    pagination as unknown as PaginationService,
    audit as unknown as AuditService,
    undefined,
    config as never,
  );

  return { service, profiles, pagination, audit, qb };
}

describe('FeaturedMentorService', () => {
  describe('defaults', () => {
    it('exposes the documented default cap and TTL', () => {
      expect(DEFAULT_MAX_FEATURED).toBe(10);
      expect(DEFAULT_FEATURED_TTL_DAYS).toBe(30);
    });
  });

  describe('feature', () => {
    it('marks the mentor featured and stamps featuredAt', async () => {
      const { service, profiles, audit } = createHarness();
      const row = profile();
      profiles.findOne.mockResolvedValue(row);

      const dto = await service.feature(row.userId, ADMIN);

      expect(profiles.save).toHaveBeenCalledWith(expect.objectContaining({ isFeatured: true }));
      expect(row.featuredAt).toBeInstanceOf(Date);
      expect(dto.isFeatured).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: AuditEvent.MENTOR_FEATURED, userId: ADMIN }),
      );
    });

    it('assigns the next featuredOrder after the current maximum', async () => {
      const { service, profiles } = createHarness();
      const row = profile();
      profiles.findOne.mockResolvedValue(row);
      const qb = { where: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ max: '4' }) };
      profiles.createQueryBuilder.mockReturnValue(qb);

      const dto = await service.feature(row.userId);

      expect(dto.featuredOrder).toBe(5);
    });

    it('refuses to feature the same mentor twice', async () => {
      const { service, profiles } = createHarness();
      const row = profile({ isFeatured: true, featuredAt: new Date() });
      profiles.findOne.mockResolvedValue(row);

      await expect(service.feature(row.userId)).rejects.toBeInstanceOf(ConflictException);
      expect(profiles.save).not.toHaveBeenCalled();
    });

    it('re-featuring an expired mentor is allowed', async () => {
      const { service, profiles } = createHarness({ ttlDays: 1 });
      const stale = profile({
        isFeatured: true,
        featuredAt: new Date(Date.now() - 5 * 86_400_000),
      });
      profiles.findOne.mockResolvedValue(stale);

      const dto = await service.feature(stale.userId);
      expect(dto.isFeatured).toBe(true);
    });

    it('404s when the mentor profile does not exist', async () => {
      const { service, profiles } = createHarness();
      profiles.findOne.mockResolvedValue(null);

      await expect(service.feature('nobody')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('maximum featured limit', () => {
    it('defaults to a cap of 10 when MAX_FEATURED_MENTORS is unset', async () => {
      const { service, profiles, qb } = createHarness();
      const row = profile();
      profiles.findOne.mockResolvedValue(row);

      qb.getCount.mockResolvedValue(9);
      await expect(service.feature(row.userId)).resolves.toMatchObject({ isFeatured: true });

      qb.getCount.mockResolvedValue(10);
      await expect(service.feature(row.userId)).rejects.toThrow('At most 10 mentors');
    });

    it('rejects a feature once the cap is reached', async () => {
      const { service, profiles, qb } = createHarness({ maxFeatured: 2 });
      const row = profile();
      profiles.findOne.mockResolvedValue(row);
      qb.getCount.mockResolvedValue(2);

      await expect(service.feature(row.userId)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.feature(row.userId)).rejects.toThrow('At most 2 mentors');
      expect(profiles.save).not.toHaveBeenCalled();
    });

    it('allows a feature while below the cap', async () => {
      const { service, profiles, qb } = createHarness({ maxFeatured: 2 });
      const row = profile();
      profiles.findOne.mockResolvedValue(row);
      qb.getCount.mockResolvedValue(1);

      await expect(service.feature(row.userId)).resolves.toMatchObject({ isFeatured: true });
    });

    it('honours a configurable cap above the default', async () => {
      const { service, profiles, qb } = createHarness({ maxFeatured: 50 });
      const row = profile();
      profiles.findOne.mockResolvedValue(row);
      qb.getCount.mockResolvedValue(10);

      await expect(service.feature(row.userId)).resolves.toMatchObject({ isFeatured: true });
    });

    it('falls back to the default cap for an unusable configured value', async () => {
      const { service, profiles, qb } = createHarness({ maxFeatured: -1 });
      const row = profile();
      profiles.findOne.mockResolvedValue(row);
      qb.getCount.mockResolvedValue(10);

      await expect(service.feature(row.userId)).resolves.toMatchObject({ isFeatured: true });
    });
  });

  describe('unfeature', () => {
    it('clears the spotlight and records an audit entry', async () => {
      const { service, profiles, audit } = createHarness();
      const row = profile({ isFeatured: true, featuredAt: new Date() });
      profiles.findOne.mockResolvedValue(row);

      await service.unfeature(row.userId, ADMIN);

      expect(row.isFeatured).toBe(false);
      expect(row.featuredAt).toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: AuditEvent.MENTOR_UNFEATURED, userId: ADMIN }),
      );
    });

    it('rejects unfeaturing a mentor who is not featured', async () => {
      const { service, profiles } = createHarness();
      const row = profile();
      profiles.findOne.mockResolvedValue(row);

      await expect(service.unfeature(row.userId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('still allows unfeaturing an expired feature so admins can clean up', async () => {
      const { service, profiles } = createHarness({ ttlDays: 1 });
      const stale = profile({ isFeatured: true, featuredAt: new Date(Date.now() - 5 * 86_400_000) });
      profiles.findOne.mockResolvedValue(stale);

      await expect(service.unfeature(stale.userId)).resolves.toMatchObject({ isFeatured: true });
    });
  });

  describe('listFeatured', () => {
    it('filters to live featured mentors and paginates', async () => {
      const { service, pagination, qb } = createHarness();
      await service.listFeatured({ page: 2, limit: 5 });

      expect(qb.where).toHaveBeenCalledWith('mentor.isFeatured = true');
      expect(qb.andWhere).toHaveBeenCalledWith('mentor.featuredAt >= :cutoff', { cutoff: expect.any(Date) });
      expect(qb.orderBy).toHaveBeenCalledWith('mentor.featuredOrder', 'ASC');
      expect(pagination.paginate).toHaveBeenCalledWith(qb, 2, 5, { links: false });
    });

    it('applies the verifiedOnly filter only when requested', async () => {
      const { service, qb } = createHarness();
      await service.listFeatured({});
      expect(qb.andWhere).not.toHaveBeenCalledWith('mentor.isVerified = true');

      await service.listFeatured({ verifiedOnly: 'true' });
      expect(qb.andWhere).toHaveBeenCalledWith('mentor.isVerified = true');
    });

    it('applies the minimum rating filter only when provided', async () => {
      const { service, qb } = createHarness();
      await service.listFeatured({ minRating: 4 });
      expect(qb.andWhere).toHaveBeenCalledWith('mentor.averageRating >= :minRating', { minRating: 4 });
    });
  });

  describe('reorder', () => {
    it('rewrites featuredOrder from the supplied sequence', async () => {
      const a = profile({ id: 'pa', userId: 'mentor-a', isFeatured: true, featuredAt: new Date() });
      const b = profile({ id: 'pb', userId: 'mentor-b', isFeatured: true, featuredAt: new Date() });
      const { service, profiles } = createHarness({ profiles: [a, b] });
      profiles.find.mockResolvedValue([a, b]);

      const result = await service.reorder({ order: ['mentor-b', 'mentor-a'] });

      expect(b.featuredOrder).toBe(0);
      expect(a.featuredOrder).toBe(1);
      expect(result.map((r) => r.userId)).toEqual(['mentor-b', 'mentor-a']);
    });

    it('rejects an empty order', async () => {
      const { service } = createHarness();
      await expect(service.reorder({ order: [] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an order longer than the cap', async () => {
      const { service } = createHarness({ maxFeatured: 1 });
      await expect(service.reorder({ order: ['mentor-a', 'mentor-b'] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown mentor ids rather than silently dropping them', async () => {
      const { service, profiles } = createHarness();
      profiles.find.mockResolvedValue([]);

      await expect(service.reorder({ order: ['ghost'] })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('stamps featuredAt on mentors that were not featured before', async () => {
      const a = profile({ userId: 'mentor-a' });
      const { service, profiles } = createHarness({ profiles: [a] });
      profiles.find.mockResolvedValue([a]);

      await service.reorder({ order: ['mentor-a'] });

      expect(a.isFeatured).toBe(true);
      expect(a.featuredAt).toBeInstanceOf(Date);
    });

    it('records a dedicated reorder audit entry naming the acting admin', async () => {
      const a = profile({ userId: 'mentor-a' });
      const { service, profiles, audit } = createHarness({ profiles: [a] });
      profiles.find.mockResolvedValue([a]);

      await service.reorder({ order: ['mentor-a'] }, ADMIN);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.MENTOR_FEATURE_REORDERED,
          userId: ADMIN,
        }),
      );
    });
  });

  describe('expiry', () => {
    it('isLive is false for an unfeatured mentor', () => {
      const { service } = createHarness();
      expect(service.isLive({ isFeatured: false, featuredAt: new Date() })).toBe(false);
    });

    it('isLive is false when isFeatured is set but featuredAt is null', () => {
      const { service } = createHarness();
      expect(service.isLive({ isFeatured: true, featuredAt: null })).toBe(false);
    });

    it('isLive is true inside the TTL window and false past it', () => {
      const { service } = createHarness({ ttlDays: 30 });
      expect(service.isLive({ isFeatured: true, featuredAt: new Date() })).toBe(true);
      expect(
        service.isLive({ isFeatured: true, featuredAt: new Date(Date.now() - 31 * 86_400_000) }),
      ).toBe(false);
    });

    it('expireStale clears lapsed spotlights and reports the count', async () => {
      const { service, profiles, audit } = createHarness({ ttlDays: 30 });
      profiles.update.mockResolvedValue({ affected: 3 });

      await expect(service.expireStale()).resolves.toBe(3);
      expect(profiles.update).toHaveBeenCalledWith(
        expect.objectContaining({ isFeatured: true }),
        { isFeatured: false, featuredAt: null },
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('expireStale is a no-op when nothing lapsed', async () => {
      const { service } = createHarness();
      await expect(service.expireStale()).resolves.toBe(0);
    });
  });

  describe('countLive', () => {
    it('counts only mentors inside the TTL window', async () => {
      const { service, qb } = createHarness();
      qb.getCount.mockResolvedValue(4);

      await expect(service.countLive()).resolves.toBe(4);
      expect(qb.where).toHaveBeenCalledWith('mentor.isFeatured = true');
    });
  });
});