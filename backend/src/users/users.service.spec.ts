import { ConflictException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { AuditEventType } from '../auth/entities/audit-log.entity';
import { UsersService } from './users.service';
import { CreateProfileDto } from './dto/create-profile.dto';

describe('UsersService', () => {
  describe('CreateProfileDto validation', () => {
    it('rejects mentor profile without required mentor fields', async () => {
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'bio')).toBe(true);
      expect(errors.some((error) => error.property === 'expertise')).toBe(true);
      expect(errors.some((error) => error.property === 'yearsOfExperience')).toBe(true);
    });

    it('rejects mentee profile without required mentee fields', async () => {
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTEE;
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'learningGoals')).toBe(true);
      expect(errors.some((error) => error.property === 'areasOfInterest')).toBe(true);
      expect(errors.some((error) => error.property === 'currentSkillLevel')).toBe(true);
      expect(errors.some((error) => error.property === 'timeCommitmentHoursPerWeek')).toBe(true);
    });
  });

  describe('createProfile', () => {
    const user = {
      id: 'user-id-1',
      roles: [{ name: AuthRole.MENTEE }],
    } as any;

    const role = { id: 'role-id', name: AuthRole.MENTOR } as any;

    let service: UsersService;
    let userRepo: any;
    let roleRepo: any;
    let mentorRepo: any;
    let menteeRepo: any;
    let auditLogService: any;

    beforeEach(() => {
      userRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockResolvedValue(user),
      };
      roleRepo = {
        findOne: jest.fn().mockResolvedValue(role),
      };
      mentorRepo = {
        findOne: jest.fn(),
        create: jest.fn().mockImplementation((payload) => payload),
        save: jest.fn().mockImplementation(async (payload) => ({ id: 'mentor-1', ...payload })),
      };
      menteeRepo = {
        findOne: jest.fn(),
        create: jest.fn().mockImplementation((payload) => payload),
        save: jest.fn().mockImplementation(async (payload) => ({ id: 'mentee-1', ...payload })),
      };
      auditLogService = {
        logEvent: jest.fn().mockResolvedValue({ id: 'audit-id' }),
      };
      service = new UsersService(userRepo, roleRepo, mentorRepo, menteeRepo, auditLogService);
    });

    it('throws conflict when mentor profile already exists', async () => {
      mentorRepo.findOne.mockResolvedValue({ id: 'mentor-1' });
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      dto.bio = 'Experienced mentor';
      dto.expertise = ['frontend'];
      dto.yearsOfExperience = 5;

      await expect(service.createProfile(user.id, dto, { ipAddress: null, userAgent: null })).rejects.toThrow(ConflictException);
      expect(mentorRepo.findOne).toHaveBeenCalledWith({ where: { user: { id: user.id } } });
    });

    it('creates a mentor profile and assigns mentor role when none exists', async () => {
      mentorRepo.findOne.mockResolvedValue(null);
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      dto.bio = 'Experienced mentor';
      dto.expertise = ['frontend'];
      dto.yearsOfExperience = 5;

      const result = await service.createProfile(user.id, dto, { ipAddress: '127.0.0.1', userAgent: 'jest' });

      expect(result).toMatchObject({ id: 'mentor-1', bio: 'Experienced mentor', expertise: ['frontend'], yearsOfExperience: 5 });
      expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { name: AuthRole.MENTOR } });
      expect(auditLogService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, eventType: AuditEventType.PROFILE_CREATED }));
    });

    it('creates a mentee profile and keeps existing mentee role', async () => {
      menteeRepo.findOne.mockResolvedValue(null);
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTEE;
      dto.learningGoals = 'Build confidence';
      dto.areasOfInterest = ['career', 'skills'];
      dto.currentSkillLevel = 'beginner';
      dto.timeCommitmentHoursPerWeek = 3;

      const result = await service.createProfile(user.id, dto, { ipAddress: '127.0.0.1', userAgent: 'jest' });

      expect(result).toMatchObject({ id: 'mentee-1', learningGoals: 'Build confidence', areasOfInterest: ['career', 'skills'], currentSkillLevel: 'beginner' });
      expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { name: AuthRole.MENTEE } });
      expect(auditLogService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, eventType: AuditEventType.PROFILE_CREATED }));
    });

    it('throws not found when user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      dto.bio = 'Test';
      dto.expertise = ['frontend'];
      dto.yearsOfExperience = 5;

      await expect(service.createProfile('bad-user', dto, { ipAddress: null, userAgent: null })).rejects.toThrow(NotFoundException);
    });
  });
});
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserStatus } from './enums/user-status.enum';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { AuditLogService, RequestAudit } from '../auth/audit-log.service';
import { AuditEventType } from '../auth/entities/audit-log.entity';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

class MockAuditLogService {
  async logEvent(_input: any): Promise<any> {
    return {};
  }
}

describe('UsersService - Username Functionality', () => {
  let service: UsersService;
  let userRepo: Repository<User>;
  let roleRepo: Repository<Role>;
  let auditLogService: AuditLogService;

  const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockRoleRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockAuditLogService = {
    logEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: getRepositoryToken(Role),
          useValue: mockRoleRepo,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    roleRepo = module.get<Repository<Role>>(getRepositoryToken(Role));
    auditLogService = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkUsernameAvailability', () => {
    it('should return available when username is valid and not taken', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const result = await service.checkUsernameAvailability('john_doe');
      expect(result).toEqual({ available: true });
      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { username: 'john_doe' } });
    });

    it('should return not available when username is already taken', async () => {
      const existingUser = { id: '1', username: 'john_doe' };
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      const result = await service.checkUsernameAvailability('john_doe');
      expect(result).toEqual({ available: false });
    });

    it('should return not available for invalid username format', async () => {
      const result = await service.checkUsernameAvailability('invalid@username');
      expect(result).toEqual({ available: false });
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('should return not available for username with consecutive special chars', async () => {
      const result = await service.checkUsernameAvailability('john__doe');
      expect(result).toEqual({ available: false });
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('should return not available for username starting with special char', async () => {
      const result = await service.checkUsernameAvailability('_john');
      expect(result).toEqual({ available: false });
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('should return not available for username ending with special char', async () => {
      const result = await service.checkUsernameAvailability('john_');
      expect(result).toEqual({ available: false });
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('should return not available for username shorter than 3 chars', async () => {
      const result = await service.checkUsernameAvailability('ab');
      expect(result).toEqual({ available: false });
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('should return not available for username longer than 30 chars', async () => {
      const result = await service.checkUsernameAvailability('a'.repeat(31));
      expect(result).toEqual({ available: false });
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('updateUsername', () => {
    const getMockUser = (): User => ({
      id: 'user-1',
      walletAddress: 'GABC123...',
      username: null,
      displayName: null,
      usernameChangedAt: null,
      tokenVersion: 0,
      timezone: 'UTC',
      avatarUrl: null,
      avatarThumbnailUrl: null,
      isVerified: false,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [],
    });

    const mockAudit: RequestAudit = {
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      deviceFingerprint: null,
    };

    it('should successfully update username when valid and available', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(getMockUser()).mockResolvedValueOnce(null);
      mockUserRepo.save.mockResolvedValue({ ...getMockUser(), username: 'john_doe', usernameChangedAt: new Date() });

      const result = await service.updateUsername('user-1', 'john_doe', mockAudit);

      expect(result.username).toBe('john_doe');
      expect(result.usernameChangedAt).toBeDefined();
      expect(mockAuditLogService.logEvent).toHaveBeenCalledWith({
        userId: 'user-1',
        eventType: AuditEventType.USERNAME_CHANGED,
        audit: mockAudit,
        details: {
          oldUsername: null,
          newUsername: 'john_doe',
        },
      });
    });

    it('should set default display name based on wallet address when not set', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(getMockUser()).mockResolvedValueOnce(null);
      mockUserRepo.save.mockResolvedValue({ 
        ...getMockUser(), 
        username: 'john_doe', 
        usernameChangedAt: new Date(),
        displayName: 'GABC12...3...' 
      });

      const result = await service.updateUsername('user-1', 'john_doe', mockAudit);

      expect(result.displayName).toBe('GABC12...3...');
    });

    it('should throw BadRequestException for invalid username format', async () => {
      await expect(service.updateUsername('user-1', 'invalid@username', mockAudit)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(service.updateUsername('user-1', 'john_doe', mockAudit)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when username is already taken by another user', async () => {
      const otherUser = { ...getMockUser(), id: 'user-2', username: 'john_doe' };
      mockUserRepo.findOne.mockResolvedValueOnce(getMockUser()).mockResolvedValueOnce(otherUser);

      await expect(service.updateUsername('user-1', 'john_doe', mockAudit)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allow updating to same username (no conflict with self)', async () => {
      const userWithUsername = { ...getMockUser(), username: 'john_doe' };
      mockUserRepo.findOne.mockResolvedValueOnce(userWithUsername).mockResolvedValueOnce(userWithUsername);
      mockUserRepo.save.mockResolvedValue({ ...userWithUsername, usernameChangedAt: new Date() });

      const result = await service.updateUsername('user-1', 'john_doe', mockAudit);

      expect(result.username).toBe('john_doe');
    });

    it('should throw BadRequestException when username changed within cooldown period', async () => {
      const userWithRecentChange = {
        ...getMockUser(),
        username: 'old_username',
        usernameChangedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      };
      mockUserRepo.findOne.mockResolvedValueOnce(userWithRecentChange).mockResolvedValueOnce(null);

      await expect(service.updateUsername('user-1', 'new_username', mockAudit)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it('should allow username change after 30 day cooldown period', async () => {
      const userWithExpiredCooldown = {
        ...getMockUser(),
        username: 'old_username',
        usernameChangedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // 31 days ago
      };
      mockUserRepo.findOne.mockResolvedValueOnce(userWithExpiredCooldown).mockResolvedValueOnce(null);
      mockUserRepo.save.mockResolvedValue({ 
        ...userWithExpiredCooldown, 
        username: 'new_username',
        usernameChangedAt: new Date() 
      });

      const result = await service.updateUsername('user-1', 'new_username', mockAudit);

      expect(result.username).toBe('new_username');
    });

    it('should allow first username change (no previous change)', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(getMockUser()).mockResolvedValueOnce(null);
      mockUserRepo.save.mockResolvedValue({ ...getMockUser(), username: 'john_doe', usernameChangedAt: new Date() });

      const result = await service.updateUsername('user-1', 'john_doe', mockAudit);

      expect(result.username).toBe('john_doe');
    });

    it('should not log audit event when audit parameter is not provided', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(getMockUser()).mockResolvedValueOnce(null);
      mockUserRepo.save.mockResolvedValue({ ...getMockUser(), username: 'john_doe', usernameChangedAt: new Date() });

      await service.updateUsername('user-1', 'john_doe');

      expect(mockAuditLogService.logEvent).not.toHaveBeenCalled();
    });
  });

  describe('updateDisplayName', () => {
    const mockUser: User = {
      id: 'user-1',
      walletAddress: 'GABC123...',
      username: 'john_doe',
      displayName: 'Old Name',
      usernameChangedAt: null,
      tokenVersion: 0,
      timezone: 'UTC',
      avatarUrl: null,
      avatarThumbnailUrl: null,
      isVerified: false,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [],
    };

    it('should successfully update display name', async () => {
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockUserRepo.save.mockResolvedValue({ ...mockUser, displayName: 'New Name' });

      const result = await service.updateDisplayName('user-1', 'New Name');

      expect(result.displayName).toBe('New Name');
    });

    it('should set display name to null', async () => {
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockUserRepo.save.mockResolvedValue({ ...mockUser, displayName: null });

      const result = await service.updateDisplayName('user-1', null);

      expect(result.displayName).toBeNull();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.updateDisplayName('user-1', 'New Name')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUsername', () => {
    it('should return user when username exists', async () => {
      const mockUser: User = {
        id: 'user-1',
        walletAddress: 'GABC123...',
        username: 'john_doe',
        displayName: 'John Doe',
        usernameChangedAt: null,
        tokenVersion: 0,
        timezone: 'UTC',
        avatarUrl: null,
        avatarThumbnailUrl: null,
        isVerified: false,
        verifiedAt: null,
        verifiedBy: null,
        verificationNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        roles: [],
      };
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findByUsername('john_doe');

      expect(result).toEqual(mockUser);
      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { username: 'john_doe' } });
    });

    it('should return null when username does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const result = await service.findByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });
});

describe('UsersService - updateStatus', () => {
  let service: UsersService;

  const mockUserRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockRoleRepo = {
    findOne: jest.fn(),
  };

  const mockAuditLogService = {
    logEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Role), useValue: mockRoleRepo },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('should update user status', async () => {
    const user = { id: '1', status: UserStatus.ACTIVE, tokenVersion: 0 } as User;
    mockUserRepo.findOne.mockResolvedValue(user);
    mockUserRepo.save.mockImplementation(async (u: User) => u);

    const result = await service.updateStatus('1', UserStatus.SUSPENDED);

    expect(result.status).toBe(UserStatus.SUSPENDED);
    expect(result.tokenVersion).toBe(1);
  });

  it('should throw NotFoundException if user not found', async () => {
    mockUserRepo.findOne.mockResolvedValue(null);
    await expect(service.updateStatus('1', UserStatus.ACTIVE)).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when reactivating a deleted user', async () => {
    const user = { id: '1', status: UserStatus.DELETED, tokenVersion: 0 } as User;
    mockUserRepo.findOne.mockResolvedValue(user);
    await expect(service.updateStatus('1', UserStatus.ACTIVE)).rejects.toThrow(BadRequestException);
  });
});
