import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProfilesService } from './profiles.service.js';
import { UsersService } from '../users/users.service.js';
import { RedisService } from '../config/redis.module.js';
import { SkillLevel } from '../users/entities/mentee-profile.entity.js';

describe('ProfilesService', () => {
  let service: ProfilesService;

  const mockUsersService = {
    findById: jest.fn(),
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mentorUser = {
    id: 'user-1',
    displayName: 'Ada Lovelace',
    avatarUrl: 'https://cdn.example.com/avatar.jpg',
    walletAddress: 'secret-wallet',
    email: 'ada@example.com',
    status: 'active',
    createdAt: new Date('2024-01-01'),
    mentorProfile: {
      bio: 'Backend expert',
      skills: ['TypeScript'],
      hourlyRate: '75.00',
      expertiseAreas: ['Backend'],
      averageRating: '4.50',
      totalMentoringHours: 40,
      isVerified: true,
      profileCompletion: 100,
    },
    menteeProfile: null,
  };

  const menteeUser = {
    id: 'user-2',
    displayName: 'Grace Hopper',
    avatarUrl: null,
    walletAddress: 'secret-wallet-2',
    email: 'grace@example.com',
    status: 'active',
    createdAt: new Date('2024-02-01'),
    mentorProfile: null,
    menteeProfile: {
      learningGoals: ['Learn NestJS'],
      areasOfInterest: ['Backend'],
      currentSkillLevel: SkillLevel.BEGINNER,
      profileCompletion: 60,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return the cached profile without hitting the database', async () => {
    const cachedProfile = { userId: 'user-1', profileType: 'mentor' };
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedProfile));

    const result = await service.getPublicProfile('user-1');

    expect(result).toEqual(cachedProfile);
    expect(mockUsersService.findById).not.toHaveBeenCalled();
  });

  it('should build and cache a safe mentor profile', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockUsersService.findById.mockResolvedValue(mentorUser);

    const result = await service.getPublicProfile('user-1');

    expect(result).toMatchObject({
      userId: 'user-1',
      profileType: 'mentor',
      displayName: 'Ada Lovelace',
      isVerified: true,
      hourlyRate: 75,
      averageRating: 4.5,
    });
    expect(result).not.toHaveProperty('walletAddress');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('status');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'public-profile:user-1',
      JSON.stringify(result),
      300,
    );
  });

  it('should build a safe mentee profile without an isVerified badge', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockUsersService.findById.mockResolvedValue(menteeUser);

    const result = await service.getPublicProfile('user-2');

    expect(result).toMatchObject({
      userId: 'user-2',
      profileType: 'mentee',
      displayName: 'Grace Hopper',
      isVerified: false,
      goals: ['Learn NestJS'],
      interests: ['Backend'],
    });
    expect(result).not.toHaveProperty('walletAddress');
  });

  it('should throw NotFoundException when the user does not exist', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockUsersService.findById.mockRejectedValue(new NotFoundException());

    await expect(service.getPublicProfile('missing-user')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when the user has no mentor or mentee profile', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockUsersService.findById.mockResolvedValue({
      ...mentorUser,
      mentorProfile: null,
      menteeProfile: null,
    });

    await expect(service.getPublicProfile('user-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
