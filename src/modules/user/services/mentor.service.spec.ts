import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { MentorService } from './mentor.service';
import { MentorProfile } from '../entities/mentor-profile.entity';

describe('MentorService', () => {
  let service: MentorService;
  let mockMentorProfileRepository;

  const mockFeaturedMentor = {
    id: 'mentor-1',
    bio: 'Featured mentor bio',
    yearsOfExperience: 5,
    expertise: ['TypeScript', 'NestJS'],
    preferredMentoringStyle: ['1-on-1'],
    availabilityHoursPerWeek: 10,
    isFeatured: true,
    featuredOrder: 0,
    featuredAt: new Date(),
    featuredExpiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: 'user-1',
      displayName: 'John Mentor',
      walletAddress: 'GXXX...',
      avatarUrl: 'http://example.com/avatar.jpg',
      email: 'john@example.com',
    },
  };

  beforeEach(async () => {
    mockMentorProfileRepository = {
      find: jest.fn(),
      count: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorService,
        {
          provide: getRepositoryToken(MentorProfile),
          useValue: mockMentorProfileRepository,
        },
      ],
    }).compile();

    service = module.get<MentorService>(MentorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFeaturedMentors', () => {
    it('should return paginated featured mentors', async () => {
      mockMentorProfileRepository.count.mockResolvedValueOnce(5);
      mockMentorProfileRepository.find.mockResolvedValueOnce([mockFeaturedMentor]);

      const result = await service.getFeaturedMentors(1, 20);

      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.data.length).toBe(1);
      expect(result.data[0].isFeatured).toBe(true);
    });

    it('should calculate correct total pages', async () => {
      mockMentorProfileRepository.count.mockResolvedValueOnce(50);
      mockMentorProfileRepository.find.mockResolvedValueOnce([mockFeaturedMentor]);

      const result = await service.getFeaturedMentors(1, 20);

      expect(result.totalPages).toBe(3);
    });

    it('should order featured mentors by featured order', async () => {
      mockMentorProfileRepository.count.mockResolvedValueOnce(1);
      mockMentorProfileRepository.find.mockResolvedValueOnce([mockFeaturedMentor]);

      await service.getFeaturedMentors(1, 20);

      expect(mockMentorProfileRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            featuredOrder: 'ASC',
          }),
        }),
      );
    });

    it('should apply correct pagination skip', async () => {
      mockMentorProfileRepository.count.mockResolvedValueOnce(50);
      mockMentorProfileRepository.find.mockResolvedValueOnce([mockFeaturedMentor]);

      await service.getFeaturedMentors(3, 10);

      expect(mockMentorProfileRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it('should return empty array when no featured mentors', async () => {
      mockMentorProfileRepository.count.mockResolvedValueOnce(0);
      mockMentorProfileRepository.find.mockResolvedValueOnce([]);

      const result = await service.getFeaturedMentors(1, 20);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getMentorById', () => {
    it('should return mentor by id', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(mockFeaturedMentor);

      const result = await service.getMentorById('mentor-1');

      expect(result).toEqual(mockFeaturedMentor);
    });

    it('should throw NotFoundException when mentor not found', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.getMentorById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('searchMentors', () => {
    it('should prioritize featured mentors when prioritizeFeatured is true', async () => {
      const mockQueryBuilder = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValueOnce([[mockFeaturedMentor], 1]),
      };

      mockMentorProfileRepository.createQueryBuilder.mockReturnValueOnce(
        mockQueryBuilder,
      );

      const result = await service.searchMentors('TypeScript', 1, 20, true);

      expect(result.data.length).toBe(1);
      expect(result.total).toBe(1);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'mentor.isFeatured',
        'DESC',
      );
    });

    it('should not prioritize featured mentors when prioritizeFeatured is false', async () => {
      const mockQueryBuilder = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValueOnce([[mockFeaturedMentor], 1]),
      };

      mockMentorProfileRepository.createQueryBuilder.mockReturnValueOnce(
        mockQueryBuilder,
      );

      await service.searchMentors('TypeScript', 1, 20, false);

      const calls = mockQueryBuilder.orderBy.mock.calls;
      const hasFeatureOrder = calls.some(
        (call) => call[0] === 'mentor.isFeatured',
      );
      expect(hasFeatureOrder).toBe(false);
    });

    it('should apply correct pagination', async () => {
      const mockQueryBuilder = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValueOnce([[mockFeaturedMentor], 1]),
      };

      mockMentorProfileRepository.createQueryBuilder.mockReturnValueOnce(
        mockQueryBuilder,
      );

      await service.searchMentors('TypeScript', 2, 10, true);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });
  });
});
