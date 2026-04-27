import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MentorAdminService } from './mentor-admin.service';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../../auth/entities/user.entity';
import { AuditLog, AuditEventType } from '../../auth/entities/audit-log.entity';
import { AppConfigService } from '../../../config/app-config.service';

describe('MentorAdminService', () => {
  let service: MentorAdminService;
  let mockMentorProfileRepository;
  let mockUserRepository;
  let mockAuditLogRepository;
  let mockAppConfigService;

  const mockMentorProfile = {
    id: 'mentor-1',
    bio: 'Test bio',
    yearsOfExperience: 5,
    expertise: ['TypeScript', 'NestJS'],
    preferredMentoringStyle: ['1-on-1'],
    availabilityHoursPerWeek: 10,
    availabilityDetails: 'Weekends only',
    isFeatured: false,
    featuredAt: null,
    featuredExpiresAt: null,
    featuredOrder: 0,
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

  const mockUser = {
    id: 'admin-1',
    displayName: 'Admin User',
    walletAddress: 'GADMIN...',
    email: 'admin@example.com',
  };

  beforeEach(async () => {
    mockMentorProfileRepository = {
      findOne: jest.fn(),
      count: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    mockUserRepository = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    mockAuditLogRepository = {
      create: jest.fn().mockImplementation((obj) => obj),
      save: jest.fn().mockResolvedValue({}),
    };

    mockAppConfigService = {
      getFeaturedMentorsConfig: jest.fn().mockReturnValue({
        maxFeaturedMentors: 10,
        expiryDays: 30,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorAdminService,
        {
          provide: getRepositoryToken(MentorProfile),
          useValue: mockMentorProfileRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockAuditLogRepository,
        },
        {
          provide: AppConfigService,
          useValue: mockAppConfigService,
        },
      ],
    }).compile();

    service = module.get<MentorAdminService>(MentorAdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('featureMentor', () => {
    it('should feature a mentor successfully', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(mockMentorProfile);
      mockMentorProfileRepository.count.mockResolvedValueOnce(5);
      mockMentorProfileRepository.findOne.mockResolvedValueOnce({ featuredOrder: 2 });
      mockMentorProfileRepository.save.mockResolvedValueOnce(mockMentorProfile);

      const result = await service.featureMentor(
        'mentor-1',
        { featuredOrder: undefined },
        'admin-1',
        '127.0.0.1',
      );

      expect(result.isFeatured).toBe(true);
      expect(mockMentorProfileRepository.save).toHaveBeenCalled();
      expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.MENTOR_FEATURED,
        }),
      );
    });

    it('should throw NotFoundException if mentor not found', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.featureMentor('non-existent', {}, 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if mentor already featured', async () => {
      const featuredMentor = { ...mockMentorProfile, isFeatured: true };
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(featuredMentor);

      await expect(
        service.featureMentor('mentor-1', {}, 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if max featured limit reached', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(mockMentorProfile);
      mockMentorProfileRepository.count.mockResolvedValueOnce(10); // Max is 10

      await expect(
        service.featureMentor('mentor-1', {}, 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set correct expiry date', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(mockMentorProfile);
      mockMentorProfileRepository.count.mockResolvedValueOnce(5);
      mockMentorProfileRepository.findOne.mockResolvedValueOnce({ featuredOrder: 2 });
      mockMentorProfileRepository.save.mockResolvedValueOnce(mockMentorProfile);

      const beforeCall = new Date();
      await service.featureMentor('mentor-1', {}, 'admin-1', '127.0.0.1');
      const afterCall = new Date();

      const saveCall = mockMentorProfileRepository.save.mock.calls[0][0];
      const expiryDate = saveCall.featuredExpiresAt;

      const expectedMinDate = new Date(beforeCall);
      expectedMinDate.setDate(expectedMinDate.getDate() + 30);

      const expectedMaxDate = new Date(afterCall);
      expectedMaxDate.setDate(expectedMaxDate.getDate() + 30);

      expect(expiryDate.getTime()).toBeGreaterThanOrEqual(expectedMinDate.getTime() - 1000);
      expect(expiryDate.getTime()).toBeLessThanOrEqual(expectedMaxDate.getTime() + 1000);
    });
  });

  describe('unfeatureMentor', () => {
    it('should unfeature a mentor successfully', async () => {
      const featuredMentor = { ...mockMentorProfile, isFeatured: true };
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(featuredMentor);
      mockMentorProfileRepository.save.mockResolvedValueOnce({
        ...featuredMentor,
        isFeatured: false,
      });

      const result = await service.unfeatureMentor('mentor-1', 'admin-1', '127.0.0.1');

      expect(result.isFeatured).toBe(false);
      expect(mockMentorProfileRepository.save).toHaveBeenCalled();
      expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.MENTOR_UNFEATURED,
        }),
      );
    });

    it('should throw BadRequestException if mentor not featured', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(mockMentorProfile);

      await expect(
        service.unfeatureMentor('mentor-1', 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if mentor not found', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.unfeatureMentor('non-existent', 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateFeaturedOrder', () => {
    it('should update featured order successfully', async () => {
      const featuredMentor = { ...mockMentorProfile, isFeatured: true };
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(featuredMentor);
      mockMentorProfileRepository.save.mockResolvedValueOnce({
        ...featuredMentor,
        featuredOrder: 5,
      });

      const result = await service.updateFeaturedOrder('mentor-1', 5, 'admin-1', '127.0.0.1');

      expect(mockMentorProfileRepository.save).toHaveBeenCalled();
      expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            action: 'order_updated',
          }),
        }),
      );
    });

    it('should throw BadRequestException if mentor not featured', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValueOnce(mockMentorProfile);

      await expect(
        service.updateFeaturedOrder('mentor-1', 5, 'admin-1', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cleanupExpiredFeaturedMentors', () => {
    it('should cleanup expired featured mentors', async () => {
      const expiredMentor = {
        ...mockMentorProfile,
        isFeatured: true,
        featuredExpiresAt: new Date(Date.now() - 1000), // 1 second ago
      };

      mockMentorProfileRepository.find.mockResolvedValueOnce([expiredMentor]);
      mockMentorProfileRepository.save.mockResolvedValueOnce(expiredMentor);

      const count = await service.cleanupExpiredFeaturedMentors();

      expect(count).toBe(1);
      expect(mockMentorProfileRepository.save).toHaveBeenCalled();
    });

    it('should not cleanup non-expired featured mentors', async () => {
      const validMentor = {
        ...mockMentorProfile,
        isFeatured: true,
        featuredExpiresAt: new Date(Date.now() + 1000000), // Far in the future
      };

      mockMentorProfileRepository.find.mockResolvedValueOnce([validMentor]);

      const count = await service.cleanupExpiredFeaturedMentors();

      expect(count).toBe(0);
      expect(mockMentorProfileRepository.save).not.toHaveBeenCalled();
    });
  });
});
