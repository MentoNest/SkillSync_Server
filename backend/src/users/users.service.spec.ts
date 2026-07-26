import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { Role } from './entities/role.entity.js';
import { MentorProfile } from './entities/mentor-profile.entity.js';
import { MenteeProfile } from './entities/mentee-profile.entity.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';
import { UserStatus } from './enums/user-status.enum.js';
import { SkillLevel } from './entities/mentee-profile.entity.js';

describe('UsersService', () => {
  let service: UsersService;

  const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
  };

  const mockRoleRepo = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockMentorProfileRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockMenteeProfileRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockUser: Partial<User> = {
    id: 'user-1',
    walletAddress: 'test-wallet',
    status: UserStatus.ACTIVE,
    roles: [],
    tokenVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Role), useValue: mockRoleRepo },
        {
          provide: getRepositoryToken(MentorProfile),
          useValue: mockMentorProfileRepo,
        },
        {
          provide: getRepositoryToken(MenteeProfile),
          useValue: mockMenteeProfileRepo,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return a user when found', async () => {
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.findById('user-1');
      expect(result).toEqual(mockUser);
      expect(mockUserRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        relations: ['roles', 'mentorProfile', 'menteeProfile'],
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createMentorProfile', () => {
    const createDto = {
      bio: 'Expert developer',
      skills: ['TypeScript', 'NestJS'],
      hourlyRate: 75,
      expertiseAreas: ['Backend'],
      yearsOfExperience: 5,
      currentRole: 'Senior Developer',
      company: 'Tech Corp',
    };

    it('should create a mentor profile successfully', async () => {
      mockUserRepo.findOne.mockResolvedValue({ ...mockUser, roles: [] });
      mockMentorProfileRepo.findOne.mockResolvedValue(null);
      const savedProfile = { id: 'profile-1', ...createDto, userId: 'user-1' };
      mockMentorProfileRepo.create.mockReturnValue(savedProfile);
      mockMentorProfileRepo.save.mockResolvedValue(savedProfile);
      mockRoleRepo.create.mockReturnValue({
        name: AuthRole.MENTOR,
        user: mockUser,
      });
      mockRoleRepo.save.mockResolvedValue({
        name: AuthRole.MENTOR,
        user: mockUser,
      });

      const result = await service.createMentorProfile('user-1', createDto);

      expect(result).toEqual(savedProfile);
      expect(mockMentorProfileRepo.create).toHaveBeenCalledWith({
        ...createDto,
        userId: 'user-1',
      });
      expect(mockRoleRepo.create).toHaveBeenCalledWith({
        name: AuthRole.MENTOR,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        user: expect.objectContaining({ id: 'user-1' }),
      });
    });

    it('should throw ConflictException when mentor profile already exists', async () => {
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockMentorProfileRepo.findOne.mockResolvedValue({
        id: 'existing-profile',
      });

      await expect(
        service.createMentorProfile('user-1', createDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should not create duplicate role if user already has mentor role', async () => {
      const userWithRole = {
        ...mockUser,
        roles: [{ name: AuthRole.MENTOR }],
      };
      mockUserRepo.findOne.mockResolvedValue(userWithRole);
      mockMentorProfileRepo.findOne.mockResolvedValue(null);
      const savedProfile = { id: 'profile-1', ...createDto, userId: 'user-1' };
      mockMentorProfileRepo.create.mockReturnValue(savedProfile);
      mockMentorProfileRepo.save.mockResolvedValue(savedProfile);

      await service.createMentorProfile('user-1', createDto);

      expect(mockRoleRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('createMenteeProfile', () => {
    const createDto = {
      learningGoals: ['Learn TypeScript'],
      areasOfInterest: ['Backend Development'],
      currentSkillLevel: SkillLevel.BEGINNER,
      preferredMentoringStyle: ['technical skills'],
      timeCommitmentHoursPerWeek: 10,
    };

    it('should create a mentee profile successfully', async () => {
      mockUserRepo.findOne.mockResolvedValue({ ...mockUser, roles: [] });
      mockMenteeProfileRepo.findOne.mockResolvedValue(null);
      const savedProfile = { id: 'profile-2', ...createDto, userId: 'user-1' };
      mockMenteeProfileRepo.create.mockReturnValue(savedProfile);
      mockMenteeProfileRepo.save.mockResolvedValue(savedProfile);
      mockRoleRepo.create.mockReturnValue({
        name: AuthRole.MENTEE,
        user: mockUser,
      });
      mockRoleRepo.save.mockResolvedValue({
        name: AuthRole.MENTEE,
        user: mockUser,
      });

      const result = await service.createMenteeProfile('user-1', createDto);

      expect(result).toEqual(savedProfile);
      expect(mockMenteeProfileRepo.create).toHaveBeenCalledWith({
        ...createDto,
        userId: 'user-1',
      });
    });

    it('should throw ConflictException when mentee profile already exists', async () => {
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockMenteeProfileRepo.findOne.mockResolvedValue({
        id: 'existing-profile',
      });

      await expect(
        service.createMenteeProfile('user-1', createDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateMentorProfile', () => {
    const existingProfile: Partial<MentorProfile> = {
      id: 'profile-1',
      userId: 'user-1',
      bio: 'Old bio',
      skills: ['JavaScript'],
      hourlyRate: 50,
      profileVersion: 1,
    };

    it('should update a mentor profile when user is the owner', async () => {
      mockMentorProfileRepo.findOne.mockResolvedValue({ ...existingProfile });
      const updatedProfile = {
        ...existingProfile,
        bio: 'New bio',
        profileVersion: 2,
      };
      mockMentorProfileRepo.save.mockResolvedValue(updatedProfile);

      const result = await service.updateMentorProfile(
        'user-1',
        'user-1',
        [AuthRole.MENTOR],
        { bio: 'New bio' },
      );

      expect(result.bio).toBe('New bio');
      expect(result.profileVersion).toBe(2);
    });

    it('should update a mentor profile when requester is admin', async () => {
      mockMentorProfileRepo.findOne.mockResolvedValue({ ...existingProfile });
      const updatedProfile = {
        ...existingProfile,
        bio: 'Admin updated',
        profileVersion: 2,
      };
      mockMentorProfileRepo.save.mockResolvedValue(updatedProfile);

      const result = await service.updateMentorProfile(
        'user-1',
        'admin-user',
        [AuthRole.ADMIN],
        { bio: 'Admin updated' },
      );

      expect(result.bio).toBe('Admin updated');
    });

    it('should throw ForbiddenException when requester is not owner or admin', async () => {
      await expect(
        service.updateMentorProfile('user-1', 'other-user', [AuthRole.MENTOR], {
          bio: 'Hack attempt',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when requester does not have mentor role', async () => {
      await expect(
        service.updateMentorProfile('user-1', 'user-1', [AuthRole.MENTEE], {
          bio: 'No role',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockMentorProfileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateMentorProfile('user-1', 'user-1', [AuthRole.MENTOR], {
          bio: 'Update',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not increment version if no fields changed', async () => {
      mockMentorProfileRepo.findOne.mockResolvedValue({ ...existingProfile });
      mockMentorProfileRepo.save.mockResolvedValue({ ...existingProfile });

      const result = await service.updateMentorProfile(
        'user-1',
        'user-1',
        [AuthRole.MENTOR],
        { bio: 'Old bio' },
      );

      expect(result.profileVersion).toBe(1);
    });
  });

  describe('updateMenteeProfile', () => {
    const existingProfile: Partial<MenteeProfile> = {
      id: 'profile-2',
      userId: 'user-1',
      learningGoals: ['Old goal'],
      currentSkillLevel: SkillLevel.BEGINNER,
      profileVersion: 1,
    };

    it('should update a mentee profile when user is the owner', async () => {
      mockMenteeProfileRepo.findOne.mockResolvedValue({ ...existingProfile });
      const updatedProfile = {
        ...existingProfile,
        learningGoals: ['New goal'],
        profileVersion: 2,
      };
      mockMenteeProfileRepo.save.mockResolvedValue(updatedProfile);

      const result = await service.updateMenteeProfile(
        'user-1',
        'user-1',
        [AuthRole.MENTEE],
        { learningGoals: ['New goal'] },
      );

      expect(result.learningGoals).toEqual(['New goal']);
      expect(result.profileVersion).toBe(2);
    });

    it('should throw ForbiddenException when requester is not owner or admin', async () => {
      await expect(
        service.updateMenteeProfile('user-1', 'other-user', [AuthRole.MENTEE], {
          learningGoals: ['Hack'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when requester does not have mentee role', async () => {
      await expect(
        service.updateMenteeProfile('user-1', 'user-1', [AuthRole.MENTOR], {
          learningGoals: ['No role'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockMenteeProfileRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateMenteeProfile('user-1', 'user-1', [AuthRole.MENTEE], {
          learningGoals: ['Update'],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMentorProfile', () => {
    it('should return mentor profile when found', async () => {
      const profile = { id: 'profile-1', userId: 'user-1', bio: 'Test' };
      mockMentorProfileRepo.findOne.mockResolvedValue(profile);

      const result = await service.getMentorProfile('user-1');
      expect(result).toEqual(profile);
    });

    it('should throw NotFoundException when not found', async () => {
      mockMentorProfileRepo.findOne.mockResolvedValue(null);
      await expect(service.getMentorProfile('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMenteeProfile', () => {
    it('should return mentee profile when found', async () => {
      const profile = { id: 'profile-2', userId: 'user-1' };
      mockMenteeProfileRepo.findOne.mockResolvedValue(profile);

      const result = await service.getMenteeProfile('user-1');
      expect(result).toEqual(profile);
    });

    it('should throw NotFoundException when not found', async () => {
      mockMenteeProfileRepo.findOne.mockResolvedValue(null);
      await expect(service.getMenteeProfile('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateUser', () => {
    it('should update user fields and save', async () => {
      const existingUser = { ...mockUser, email: undefined };
      mockUserRepo.findOne
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

      const result = await service.updateUser('user-1', {
        displayName: 'New Name',
        email: 'new@example.com',
      });

      expect(result.displayName).toBe('New Name');
      expect(result.email).toBe('new@example.com');
      expect(mockUserRepo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException when email is already taken', async () => {
      const existingUser = { ...mockUser, email: undefined };
      mockUserRepo.findOne
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce({
          id: 'other-user',
          email: 'taken@example.com',
        });

      await expect(
        service.updateUser('user-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateUser('missing-user', { displayName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivateUser', () => {
    it('should set status to deleted and save', async () => {
      const existingUser = { ...mockUser, status: UserStatus.ACTIVE };
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

      const result = await service.deactivateUser('user-1');

      expect(result.status).toBe(UserStatus.DELETED);
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      mockUserRepo.findAndCount.mockResolvedValue([[mockUser], 1]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({
        data: [mockUser],
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(mockUserRepo.findAndCount).toHaveBeenCalledWith({
        where: {},
        relations: ['roles'],
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
    });

    it('should filter by status when provided', async () => {
      mockUserRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        status: UserStatus.SUSPENDED,
        page: 2,
        limit: 10,
      });

      expect(mockUserRepo.findAndCount).toHaveBeenCalledWith({
        where: { status: UserStatus.SUSPENDED },
        relations: ['roles'],
        skip: 10,
        take: 10,
        order: { createdAt: 'DESC' },
      });
    });
  });
});
