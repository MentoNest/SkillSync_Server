import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { RbacService } from '../../rbac/rbac.service';
import { RoleName } from '../../rbac/roles';
import { REDIS } from '../../redis/redis.module';
import { MenteeProfile, SkillLevel } from '../entities/mentee-profile.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';
import { ProfileType } from './dto/profile.dto';
import { ProfileService } from './profile.service';

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn((value: unknown) => value),
  save: jest.fn((value: unknown) => Promise.resolve(value)),
});

describe('ProfileService', () => {
  let service: ProfileService;
  let users: ReturnType<typeof mockRepo>;
  let mentorProfiles: ReturnType<typeof mockRepo>;
  let menteeProfiles: ReturnType<typeof mockRepo>;
  let audit: { record: jest.Mock };
  let rbac: { assignRole: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const user = { id: 'user-1', walletAddress: 'GABC', createdAt: new Date('2024-01-01') } as unknown as User;

  beforeEach(async () => {
    users = mockRepo();
    mentorProfiles = mockRepo();
    menteeProfiles = mockRepo();
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    rbac = { assignRole: jest.fn().mockResolvedValue(undefined) };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(MentorProfile), useValue: mentorProfiles },
        { provide: getRepositoryToken(MenteeProfile), useValue: menteeProfiles },
        { provide: AuditService, useValue: audit },
        { provide: RbacService, useValue: rbac },
        { provide: REDIS, useValue: redis },
      ],
    }).compile();

    service = module.get(ProfileService);
  });

  describe('create', () => {
    it('creates a mentor profile, assigns the mentor role and audits it', async () => {
      users.findOne.mockResolvedValue(user);
      mentorProfiles.findOne.mockResolvedValue(null);

      const result = await service.create('user-1', {
        profileType: ProfileType.MENTOR,
        mentor: { bio: 'Senior dev', skills: ['node'] },
      });

      expect(mentorProfiles.save).toHaveBeenCalled();
      expect(rbac.assignRole).toHaveBeenCalledWith('user-1', RoleName.MENTOR);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: AuditEvent.PROFILE_CREATED, userId: 'user-1' }),
      );
      expect(result).toMatchObject({ userId: 'user-1', bio: 'Senior dev' });
      expect(redis.del).toHaveBeenCalledWith('public-profile:user-1');
    });

    it('throws 409 when the mentor profile already exists', async () => {
      users.findOne.mockResolvedValue(user);
      mentorProfiles.findOne.mockResolvedValue({ id: 'p1' });

      await expect(service.create('user-1', { profileType: ProfileType.MENTOR, mentor: { bio: 'x', skills: [] } })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(rbac.assignRole).not.toHaveBeenCalled();
    });

    it('creates a mentee profile defaulting the skill level and assigning the mentee role', async () => {
      users.findOne.mockResolvedValue(user);
      menteeProfiles.findOne.mockResolvedValue(null);

      const result = await service.create('user-1', {
        profileType: ProfileType.MENTEE,
        mentee: { learningGoals: ['learn nest'], areasOfInterest: ['backend'] } as never,
      });

      expect(rbac.assignRole).toHaveBeenCalledWith('user-1', RoleName.MENTEE);
      expect(result).toMatchObject({ skillLevel: SkillLevel.BEGINNER });
    });

    it('throws 404 when the user does not exist', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(
        service.create('missing', { profileType: ProfileType.MENTEE, mentee: { learningGoals: [], areasOfInterest: [] } as never }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects a caller without the matching role', async () => {
      await expect(service.update('user-1', [], ProfileType.MENTOR, { bio: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('applies a partial update, bumps the version and audits old/new values', async () => {
      const profile = { id: 'p1', userId: 'user-1', bio: 'old', profileVersion: 2 } as unknown as MentorProfile;
      mentorProfiles.findOne.mockResolvedValue(profile);

      const result = await service.update('user-1', [RoleName.MENTOR], ProfileType.MENTOR, { bio: 'new' });

      expect(profile.bio).toBe('new');
      expect(profile.profileVersion).toBe(3);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.PROFILE_UPDATED,
          metadata: expect.objectContaining({ changedFields: ['bio'] }),
        }),
      );
      expect(result).toMatchObject({ bio: 'new', profileVersion: 3 });
    });

    it('does not bump the version when nothing changed', async () => {
      const profile = { id: 'p1', userId: 'user-1', bio: 'same', profileVersion: 1 } as unknown as MentorProfile;
      mentorProfiles.findOne.mockResolvedValue(profile);

      await service.update('user-1', [RoleName.MENTOR], ProfileType.MENTOR, { bio: 'same' });

      expect(profile.profileVersion).toBe(1);
      expect(mentorProfiles.save).not.toHaveBeenCalled();
    });

    it('lets an admin update another user profile via targetUserId', async () => {
      const profile = { id: 'p2', userId: 'target', bio: 'old', profileVersion: 1 } as unknown as MentorProfile;
      mentorProfiles.findOne.mockResolvedValue(profile);

      await service.update('admin', [RoleName.ADMIN], ProfileType.MENTOR, { bio: 'new' }, 'target');

      expect(mentorProfiles.findOne).toHaveBeenCalledWith({ where: { userId: 'target' } });
      expect(profile.bio).toBe('new');
    });
  });

  describe('getPublicProfile', () => {
    it('returns safe mentor fields without sensitive data', async () => {
      users.findOne.mockResolvedValue(user);
      mentorProfiles.findOne.mockResolvedValue({
        id: 'p1',
        bio: 'hi',
        skills: ['ts'],
        hourlyRate: 50,
        expertiseAreas: ['web'],
        averageRating: 4.5,
        reviewCount: 3,
        totalMentoringHours: 10,
        isVerified: true,
      } as unknown as MentorProfile);

      const result = await service.getPublicProfile('user-1');

      expect(result).toMatchObject({
        profileType: ProfileType.MENTOR,
        isVerified: true,
        bio: 'hi',
        totalSessions: 3,
      });
      expect(result).not.toHaveProperty('walletAddress');
      expect(result).not.toHaveProperty('email');
      expect(redis.set).toHaveBeenCalled();
    });

    it('throws 404 when the user has no profile', async () => {
      users.findOne.mockResolvedValue(user);
      mentorProfiles.findOne.mockResolvedValue(null);
      menteeProfiles.findOne.mockResolvedValue(null);

      await expect(service.getPublicProfile('user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the user does not exist', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(service.getPublicProfile('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
