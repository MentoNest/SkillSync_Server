import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { REDIS } from '../../redis/redis.module';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';
import { computeCompleteness } from './profile-completeness';
import { ProfileCompletenessService } from './profile-completeness.service';

describe('computeCompleteness', () => {
  it('gives a full mentor profile 100 plus the optional bonus (capped at 110)', () => {
    const result = computeCompleteness({
      profileType: 'mentor',
      bio: 'Experienced mentor',
      skills: ['node'],
      hourlyRate: 50,
      expertiseAreas: ['backend'],
      avatarUrl: 'https://cdn/avatar.png',
      availabilitySlots: 3,
      portfolioLinks: 2,
      education: [{}],
      certifications: [{}],
    });
    expect(result.score).toBe(110);
    expect(result.missing).toHaveLength(0);
  });

  it('reports every missing mentor field for an empty profile', () => {
    const result = computeCompleteness({ profileType: 'mentor' });
    expect(result.score).toBe(0);
    expect(result.missing.map((m) => m.field)).toEqual(
      expect.arrayContaining(['bio', 'skills', 'hourlyRate', 'expertiseAreas', 'avatarUrl', 'availabilitySlots']),
    );
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('scores mentees on their three required fields', () => {
    const half = computeCompleteness({ profileType: 'mentee', learningGoals: ['learn rust'], skillLevel: null });
    expect(half.score).toBe(33);
    expect(half.missing.map((m) => m.field)).toEqual(expect.arrayContaining(['skillLevel', 'areasOfInterest']));

    const full = computeCompleteness({
      profileType: 'mentee',
      learningGoals: ['learn rust'],
      skillLevel: 'beginner',
      areasOfInterest: ['backend'],
    });
    expect(full.score).toBe(100);
    expect(full.suggestions).toHaveLength(0);
  });

  it('caps the optional bonus at +10', () => {
    const result = computeCompleteness({
      profileType: 'mentee',
      learningGoals: ['a'],
      skillLevel: 'b',
      areasOfInterest: ['c'],
      portfolioLinks: 1,
      education: [{}],
      certifications: [{}],
    });
    expect(result.bonus).toBe(10);
    expect(result.score).toBe(110);
  });
});

describe('ProfileCompletenessService', () => {
  let service: ProfileCompletenessService;
  const users = { findOne: jest.fn(), find: jest.fn(), query: jest.fn() };
  const mentors = { findOne: jest.fn(), query: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileCompletenessService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(MentorProfile), useValue: mentors },
      ],
    }).compile();
    service = module.get(ProfileCompletenessService);
  });

  it('computes and returns the score with missing fields', async () => {
    users.findOne.mockResolvedValue({ id: 'u1', avatarUrl: null });
    mentors.findOne.mockResolvedValue({ userId: 'u1', bio: 'hi', skills: ['x'], hourlyRate: 10 });
    mentors.query.mockRejectedValue(new Error('relation does not exist'));

    const result = await service.compute('u1');
    expect(result.profileType).toBe('mentor');
    expect(result.missing.map((m) => m.field)).toEqual(expect.arrayContaining(['expertiseAreas', 'avatarUrl']));
  });

  it('throws for unknown users', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(service.compute('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses the Redis cache when present', async () => {
    const cached = { profileType: 'mentee', score: 42, bonus: 0, missing: [], suggestions: [] };
    const redis = { get: jest.fn().mockResolvedValue(JSON.stringify(cached)), setex: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileCompletenessService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(MentorProfile), useValue: mentors },
        { provide: REDIS, useValue: redis },
      ],
    }).compile();
    service = module.get(ProfileCompletenessService);

    const result = await service.compute('u1');
    expect(result.score).toBe(42);
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it('lists scores for every user', async () => {
    users.find.mockResolvedValue([{ id: 'u1', username: 'a' }]);
    users.findOne.mockResolvedValue({ id: 'u1', avatarUrl: null });
    mentors.findOne.mockResolvedValue(null);
    mentors.query.mockRejectedValue(new Error('no table'));

    const list = await service.computeForAllUsers();
    expect(list).toEqual([{ userId: 'u1', username: 'a', score: 0 }]);
  });
});
