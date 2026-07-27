import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UserStatus } from './enums/user-status.enum.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    findById: jest.fn(),
    updateUser: jest.fn(),
    deactivateUser: jest.fn(),
    findAll: jest.fn(),
    createMentorProfile: jest.fn(),
    createMenteeProfile: jest.fn(),
    updateMentorProfile: jest.fn(),
    updateMenteeProfile: jest.fn(),
    getMentorProfile: jest.fn(),
    getMenteeProfile: jest.fn(),
  };

  const mockRequest = (sub: string, roles: string[] = []) => ({
    user: {
      sub,
      roles,
      wallet: 'test-wallet',
      jti: 'test-jti',
      iat: 0,
      exp: 0,
    },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockUserEntity = {
    id: 'user-1',
    walletAddress: 'test-wallet',
    username: 'skillsync-user',
    displayName: 'Skillsync User',
    email: 'user@example.com',
    status: UserStatus.ACTIVE,
    roles: [{ name: AuthRole.MENTOR }],
    tokenVersion: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  };

  describe('getMe', () => {
    it('should return the requesting user', async () => {
      mockUsersService.findById.mockResolvedValue(mockUserEntity);

      const result = await controller.getMe(mockRequest('user-1') as any);

      expect(mockUsersService.findById).toHaveBeenCalledWith('user-1');
      expect(result).toMatchObject({
        id: 'user-1',
        walletAddress: 'test-wallet',
        email: 'user@example.com',
        roles: [AuthRole.MENTOR],
      });
    });
  });

  describe('updateMe', () => {
    it('should update and return the requesting user', async () => {
      const dto = { displayName: 'New Name' };
      mockUsersService.updateUser.mockResolvedValue({
        ...mockUserEntity,
        displayName: 'New Name',
      });

      const result = await controller.updateMe(
        dto,
        mockRequest('user-1') as any,
      );

      expect(mockUsersService.updateUser).toHaveBeenCalledWith('user-1', dto);
      expect(result.displayName).toBe('New Name');
    });
  });

  describe('deleteMe', () => {
    it('should deactivate the requesting user', async () => {
      mockUsersService.deactivateUser.mockResolvedValue({
        ...mockUserEntity,
        status: UserStatus.DELETED,
      });

      const result = await controller.deleteMe(mockRequest('user-1') as any);

      expect(mockUsersService.deactivateUser).toHaveBeenCalledWith('user-1');
      expect(result.status).toBe(UserStatus.DELETED);
    });
  });

  describe('listUsers', () => {
    it('should return a paginated, mapped list of users', async () => {
      mockUsersService.findAll.mockResolvedValue({
        data: [mockUserEntity],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.listUsers({ page: 1, limit: 20 });

      expect(mockUsersService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
      expect(result.data[0]).toMatchObject({ id: 'user-1' });
    });
  });

  describe('createProfile', () => {
    it('should create a mentor profile', async () => {
      const dto = {
        profileType: 'mentor' as const,
        mentorData: { bio: 'Test' },
      };
      const expected = { id: 'profile-1', bio: 'Test' };
      mockUsersService.createMentorProfile.mockResolvedValue(expected);

      const result = await controller.createProfile(
        dto,
        mockRequest('user-1') as any,
      );

      expect(result).toEqual(expected);
      expect(mockUsersService.createMentorProfile).toHaveBeenCalledWith(
        'user-1',
        { bio: 'Test' },
      );
    });

    it('should create a mentee profile', async () => {
      const dto = {
        profileType: 'mentee' as const,
        menteeData: { learningGoals: ['Learn NestJS'] },
      };
      const expected = { id: 'profile-2', learningGoals: ['Learn NestJS'] };
      mockUsersService.createMenteeProfile.mockResolvedValue(expected);

      const result = await controller.createProfile(
        dto,
        mockRequest('user-1') as any,
      );

      expect(result).toEqual(expected);
      expect(mockUsersService.createMenteeProfile).toHaveBeenCalledWith(
        'user-1',
        {
          learningGoals: ['Learn NestJS'],
        },
      );
    });

    it('should pass empty object when no type-specific data provided', async () => {
      const dto = { profileType: 'mentor' as const };
      mockUsersService.createMentorProfile.mockResolvedValue({
        id: 'profile-1',
      });

      await controller.createProfile(dto, mockRequest('user-1') as any);

      expect(mockUsersService.createMentorProfile).toHaveBeenCalledWith(
        'user-1',
        {},
      );
    });
  });

  describe('updateProfile', () => {
    it('should update a mentor profile', async () => {
      const dto = { bio: 'Updated bio' };
      const expected = { id: 'profile-1', bio: 'Updated bio' };
      mockUsersService.updateMentorProfile.mockResolvedValue(expected);

      const result = await controller.updateProfile(
        'mentor',
        dto,
        mockRequest('user-1', ['mentor']) as any,
      );

      expect(result).toEqual(expected);
      expect(mockUsersService.updateMentorProfile).toHaveBeenCalledWith(
        'user-1',
        'user-1',
        ['mentor'],
        dto,
      );
    });

    it('should update a mentee profile', async () => {
      const dto = { learningGoals: ['Updated goal'] };
      const expected = { id: 'profile-2', learningGoals: ['Updated goal'] };
      mockUsersService.updateMenteeProfile.mockResolvedValue(expected);

      const result = await controller.updateProfile(
        'mentee',
        dto,
        mockRequest('user-1', ['mentee']) as any,
      );

      expect(result).toEqual(expected);
      expect(mockUsersService.updateMenteeProfile).toHaveBeenCalledWith(
        'user-1',
        'user-1',
        ['mentee'],
        dto,
      );
    });

    it('should return error message for invalid profile type', async () => {
      const result = await controller.updateProfile(
        'invalid',
        {},
        mockRequest('user-1') as any,
      );

      expect(result).toEqual({
        message: 'Invalid profile type. Must be "mentor" or "mentee".',
      });
    });
  });

  describe('getProfile', () => {
    it('should get a mentor profile', async () => {
      const expected = { id: 'profile-1', bio: 'Test' };
      mockUsersService.getMentorProfile.mockResolvedValue(expected);

      const result = await controller.getProfile(
        'mentor',
        mockRequest('user-1') as any,
      );

      expect(result).toEqual(expected);
      expect(mockUsersService.getMentorProfile).toHaveBeenCalledWith('user-1');
    });

    it('should get a mentee profile', async () => {
      const expected = { id: 'profile-2' };
      mockUsersService.getMenteeProfile.mockResolvedValue(expected);

      const result = await controller.getProfile(
        'mentee',
        mockRequest('user-1') as any,
      );

      expect(result).toEqual(expected);
      expect(mockUsersService.getMenteeProfile).toHaveBeenCalledWith('user-1');
    });

    it('should return error message for invalid profile type', async () => {
      const result = await controller.getProfile(
        'invalid',
        mockRequest('user-1') as any,
      );

      expect(result).toEqual({
        message: 'Invalid profile type. Must be "mentor" or "mentee".',
      });
    });
  });
});
