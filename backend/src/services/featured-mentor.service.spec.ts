import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { FeaturedMentorService } from './featured-mentor.service.js';
import { MentorProfile } from '../entities/mentor-profile.entity.js';
import { AuditService } from '../audit/audit.service.js';

const MENTOR_ID = 'mentor-uuid-1';
const ADMIN_ID = 'admin-uuid-1';

const buildProfile = (overrides: Partial<MentorProfile> = {}): MentorProfile =>
  ({
    id: MENTOR_ID,
    userId: 'user-uuid-1',
    isFeatured: false,
    featuredAt: null,
    featuredOrder: null,
    ...overrides,
  } as MentorProfile);

describe('FeaturedMentorService', () => {
  let service: FeaturedMentorService;
  let mockRepo: any;
  let mockAuditService: any;

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeaturedMentorService,
        { provide: getRepositoryToken(MentorProfile), useValue: mockRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<FeaturedMentorService>(FeaturedMentorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('featureMentor', () => {
    it('should feature a mentor successfully', async () => {
      const profile = buildProfile();
      mockRepo.findOne.mockResolvedValue(profile);

      const result = await service.featureMentor(MENTOR_ID, ADMIN_ID, { featuredOrder: 1 });

      expect(result.isFeatured).toBe(true);
      expect(result.featuredAt).toBeInstanceOf(Date);
      expect(result.featuredOrder).toBe(1);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MENTOR_FEATURED', userId: ADMIN_ID }),
      );
    });

    it('should throw NotFoundException for unknown mentor', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.featureMentor('bad-id', ADMIN_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if mentor is already featured', async () => {
      mockRepo.findOne.mockResolvedValue(buildProfile({ isFeatured: true, featuredAt: new Date() }));
      await expect(service.featureMentor(MENTOR_ID, ADMIN_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when featured limit is reached', async () => {
      mockRepo.findOne.mockResolvedValue(buildProfile());
      mockRepo.count.mockResolvedValue(10); // equals default max
      await expect(service.featureMentor(MENTOR_ID, ADMIN_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('unfeatureMentor', () => {
    it('should unfeature a featured mentor', async () => {
      const profile = buildProfile({ isFeatured: true, featuredAt: new Date(), featuredOrder: 2 });
      mockRepo.findOne.mockResolvedValue(profile);

      const result = await service.unfeatureMentor(MENTOR_ID, ADMIN_ID);

      expect(result.isFeatured).toBe(false);
      expect(result.featuredAt).toBeNull();
      expect(result.featuredOrder).toBeNull();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MENTOR_UNFEATURED', userId: ADMIN_ID }),
      );
    });

    it('should throw NotFoundException for unknown mentor', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.unfeatureMentor('bad-id', ADMIN_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if mentor is not featured', async () => {
      mockRepo.findOne.mockResolvedValue(buildProfile({ isFeatured: false }));
      await expect(service.unfeatureMentor(MENTOR_ID, ADMIN_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFeaturedMentors', () => {
    it('should return paginated featured mentor list', async () => {
      const profile = buildProfile({ isFeatured: true, featuredAt: new Date(), featuredOrder: 1 });
      const qb = mockRepo.createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[profile], 1]);

      const result = await service.getFeaturedMentors(1, 20);

      expect(result.total).toBe(1);
      expect(result.data[0].isFeatured).toBe(true);
      expect(result.totalPages).toBe(1);
    });

    it('should return empty list when no mentors are featured', async () => {
      const result = await service.getFeaturedMentors(1, 20);
      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('expireStale', () => {
    it('should unfeature mentors whose featuredAt is older than expiry', async () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const staleProfile = buildProfile({ isFeatured: true, featuredAt: oldDate });
      const qb = mockRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([staleProfile]);

      await service.expireStale();

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ isFeatured: false })]),
      );
    });

    it('should not call save when no stale profiles', async () => {
      await service.expireStale();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });
});
