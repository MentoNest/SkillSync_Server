// src/mentors/mentors.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MentorsService } from './mentors-profile.service';
import {
  MentorProfile,
  MentorProfileStatus,
} from './entities/mentors-profile.entity';

describe('MentorsService', () => {
  let service: MentorsService;
  let repository: Repository<MentorProfile>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorsService,
        {
          provide: getRepositoryToken(MentorProfile),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<MentorsService>(MentorsService);
    repository = module.get<Repository<MentorProfile>>(
      getRepositoryToken(MentorProfile),
    );

    jest.clearAllMocks();
  });

  describe('createProfile', () => {
    it('should create a mentor profile in draft status', async () => {
      const userId = 'user-123';
      const dto = {
        headline: 'Senior Developer',
        rateMinor: 1500000,
        yearsExp: 5,
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        userId,
        ...dto,
        status: MentorProfileStatus.DRAFT,
      });
      mockRepository.save.mockResolvedValue({
        id: 'profile-123',
        userId,
        ...dto,
        status: MentorProfileStatus.DRAFT,
      });

      const result = await service.createProfile(userId, dto);

      expect(result.status).toBe(MentorProfileStatus.DRAFT);
      expect(result.userId).toBe(userId);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if profile already exists', async () => {
      const userId = 'user-123';
      const dto = {
        headline: 'Senior Developer',
        rateMinor: 1500000,
        yearsExp: 5,
      };

      mockRepository.findOne.mockResolvedValue({ id: 'existing-profile' });

      await expect(service.createProfile(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateProfile', () => {
    it('should update profile in draft status', async () => {
      const userId = 'user-123';
      const profile = {
        id: 'profile-123',
        userId,
        headline: 'Old Headline',
        rateMinor: 1000000,
        yearsExp: 3,
        status: MentorProfileStatus.DRAFT,
      };

      const updateDto = { headline: 'New Headline' };

      mockRepository.findOne.mockResolvedValue(profile);
      mockRepository.save.mockResolvedValue({ ...profile, ...updateDto });

      const result = await service.updateProfile(userId, updateDto);

      expect(result.headline).toBe('New Headline');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when updating non-draft profile', async () => {
      const userId = 'user-123';
      const profile = {
        id: 'profile-123',
        userId,
        status: MentorProfileStatus.SUBMITTED,
      };

      mockRepository.findOne.mockResolvedValue(profile);

      await expect(
        service.updateProfile(userId, { headline: 'New' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitProfile', () => {
    it('should transition from draft to submitted', async () => {
      const userId = 'user-123';
      const profile = {
        id: 'profile-123',
        userId,
        status: MentorProfileStatus.DRAFT,
      };

      mockRepository.findOne.mockResolvedValue(profile);
      mockRepository.save.mockResolvedValue({
        ...profile,
        status: MentorProfileStatus.SUBMITTED,
      });

      const result = await service.submitProfile(userId);

      expect(result.status).toBe(MentorProfileStatus.SUBMITTED);
    });

    it('should throw BadRequestException when submitting non-draft profile', async () => {
      const userId = 'user-123';
      const profile = {
        id: 'profile-123',
        userId,
        status: MentorProfileStatus.APPROVED,
      };

      mockRepository.findOne.mockResolvedValue(profile);

      await expect(service.submitProfile(userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('approveProfile', () => {
    it('should transition from submitted to approved', async () => {
      const profileId = 'profile-123';
      const profile = {
        id: profileId,
        userId: 'user-123',
        status: MentorProfileStatus.SUBMITTED,
      };

      mockRepository.findOne.mockResolvedValue(profile);
      mockRepository.save.mockResolvedValue({
        ...profile,
        status: MentorProfileStatus.APPROVED,
      });

      const result = await service.approveProfile(profileId);

      expect(result.status).toBe(MentorProfileStatus.APPROVED);
    });

    it('should throw BadRequestException when approving non-submitted profile', async () => {
      const profileId = 'profile-123';
      const profile = {
        id: profileId,
        status: MentorProfileStatus.DRAFT,
      };

      mockRepository.findOne.mockResolvedValue(profile);

      await expect(service.approveProfile(profileId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.approveProfile('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('rejectProfile', () => {
    it('should transition from submitted to rejected', async () => {
      const profileId = 'profile-123';
      const profile = {
        id: profileId,
        userId: 'user-123',
        status: MentorProfileStatus.SUBMITTED,
      };

      mockRepository.findOne.mockResolvedValue(profile);
      mockRepository.save.mockResolvedValue({
        ...profile,
        status: MentorProfileStatus.REJECTED,
      });

      const result = await service.rejectProfile(
        profileId,
        'Incomplete information',
      );

      expect(result.status).toBe(MentorProfileStatus.REJECTED);
    });

    it('should throw BadRequestException when rejecting non-submitted profile', async () => {
      const profileId = 'profile-123';
      const profile = {
        id: profileId,
        status: MentorProfileStatus.APPROVED,
      };

      mockRepository.findOne.mockResolvedValue(profile);

      await expect(service.rejectProfile(profileId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateOwnership', () => {
    it('should throw ForbiddenException when user tries to modify another user profile', () => {
      const userId = 'user-123';
      const profile = {
        id: 'profile-123',
        userId: 'different-user',
      } as MentorProfile;

      expect(() => service.validateOwnership(userId, profile)).toThrow(
        ForbiddenException,
      );
    });

    it('should not throw when user modifies their own profile', () => {
      const userId = 'user-123';
      const profile = {
        id: 'profile-123',
        userId: 'user-123',
      } as MentorProfile;

      expect(() => service.validateOwnership(userId, profile)).not.toThrow();
    });
  });

  describe('status transitions', () => {
    it('should allow draft → submitted transition', async () => {
      const userId = 'user-123';
      const profile = {
        id: 'profile-123',
        userId,
        status: MentorProfileStatus.DRAFT,
      };

      mockRepository.findOne.mockResolvedValue(profile);
      mockRepository.save.mockResolvedValue({
        ...profile,
        status: MentorProfileStatus.SUBMITTED,
      });

      await expect(service.submitProfile(userId)).resolves.toBeDefined();
    });

    it('should allow submitted → approved transition', async () => {
      const profile = {
        id: 'profile-123',
        status: MentorProfileStatus.SUBMITTED,
      };

      mockRepository.findOne.mockResolvedValue(profile);
      mockRepository.save.mockResolvedValue({
        ...profile,
        status: MentorProfileStatus.APPROVED,
      });

      await expect(service.approveProfile(profile.id)).resolves.toBeDefined();
    });

    it('should allow submitted → rejected transition', async () => {
      const profile = {
        id: 'profile-123',
        status: MentorProfileStatus.SUBMITTED,
      };

      mockRepository.findOne.mockResolvedValue(profile);
      mockRepository.save.mockResolvedValue({
        ...profile,
        status: MentorProfileStatus.REJECTED,
      });

      await expect(service.rejectProfile(profile.id)).resolves.toBeDefined();
    });

    it('should not allow approved → submitted transition', async () => {
      const userId = 'user-123';
      const profile = {
        id: 'profile-123',
        userId,
        status: MentorProfileStatus.APPROVED,
      };

      mockRepository.findOne.mockResolvedValue(profile);

      await expect(service.submitProfile(userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
