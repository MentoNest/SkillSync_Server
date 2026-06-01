import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RedisThrottlerGuard } from '../auth/guards/redis-throttler.guard';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockJwtPayload = {
    sub: 'user-id-123',
    email: 'test@example.com',
    iat: Date.now(),
    exp: Date.now() + 3600000,
  };

  const mockRequest = {
    user: mockJwtPayload,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'Mozilla/5.0' },
  } as unknown as Request & { user?: typeof mockJwtPayload };

  const mockUser = {
    id: 'user-id-123',
    walletAddress: 'GXXXX',
    roles: [{ name: AuthRole.MENTEE }],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMentorProfile = {
    id: 'mentor-1',
    bio: 'Experienced mentor',
    expertise: ['frontend', 'typescript'],
    yearsOfExperience: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMenteeProfile = {
    id: 'mentee-1',
    learningGoals: 'Learn web development',
    areasOfInterest: ['frontend'],
    currentSkillLevel: 'intermediate',
    timeCommitmentHoursPerWeek: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    const usersServiceMock = {
      findById: jest.fn(),
      createProfile: jest.fn(),
      assignRole: jest.fn(),
      revokeRole: jest.fn(),
      updateProfile: jest.fn(),
    } as unknown as UsersService;

    controller = new UsersController(usersServiceMock);
    service = usersServiceMock as unknown as UsersService;
  });

  describe('getMe', () => {
    it('should return current user profile', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(mockUser);

      const result = await controller.getMe(mockRequest);

      expect(result).toEqual(mockUser);
      expect(service.findById).toHaveBeenCalledWith('user-id-123');
    });

    it('should throw error if user not found', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(null);

      await expect(controller.getMe(mockRequest)).rejects.toThrow('User not found');
    });

    it('should throw error if no user in request', async () => {
      const requestWithoutUser = { ...mockRequest, user: undefined } as any;

      await expect(controller.getMe(requestWithoutUser)).rejects.toThrow('User not found');
    });
  });

  describe('createProfile', () => {
    it('should create a mentor profile', async () => {
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      dto.bio = mockMentorProfile.bio;
      dto.expertise = mockMentorProfile.expertise;
      dto.yearsOfExperience = mockMentorProfile.yearsOfExperience;

      jest.spyOn(service, 'createProfile').mockResolvedValue(mockMentorProfile);

      const result = await controller.createProfile(mockRequest, dto);

      expect(result).toEqual(mockMentorProfile);
      expect(service.createProfile).toHaveBeenCalledWith('user-id-123', dto, {
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    it('should create a mentee profile', async () => {
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTEE;
      dto.learningGoals = mockMenteeProfile.learningGoals;
      dto.areasOfInterest = mockMenteeProfile.areasOfInterest;
      dto.currentSkillLevel = mockMenteeProfile.currentSkillLevel;
      dto.timeCommitmentHoursPerWeek = mockMenteeProfile.timeCommitmentHoursPerWeek;

      jest.spyOn(service, 'createProfile').mockResolvedValue(mockMenteeProfile);

      const result = await controller.createProfile(mockRequest, dto);

      expect(result).toEqual(mockMenteeProfile);
      expect(service.createProfile).toHaveBeenCalledWith('user-id-123', dto, {
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    it('should throw ConflictException if profile already exists', async () => {
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      dto.bio = 'Another mentor';
      dto.expertise = ['backend'];
      dto.yearsOfExperience = 3;

      jest.spyOn(service, 'createProfile').mockRejectedValue(new ConflictException('Mentor profile already exists'));

      await expect(controller.createProfile(mockRequest, dto)).rejects.toThrow(ConflictException);
    });

    it('should throw error if no user in request', async () => {
      const requestWithoutUser = { ...mockRequest, user: undefined } as any;
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;

      await expect(controller.createProfile(requestWithoutUser, dto)).rejects.toThrow('User not found');
    });

    it('should pass audit information to service', async () => {
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      dto.bio = 'Test';
      dto.expertise = ['skill'];
      dto.yearsOfExperience = 1;

      jest.spyOn(service, 'createProfile').mockResolvedValue(mockMentorProfile);

      await controller.createProfile(mockRequest, dto);

      expect(service.createProfile).toHaveBeenCalledWith(
        'user-id-123',
        dto,
        expect.objectContaining({
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
        }),
      );
    });
  });

  describe('updateProfile', () => {
    it('should update a mentor profile', async () => {
      const dto = new UpdateProfileDto();
      dto.bio = 'Updated bio';

      jest.spyOn(service, 'updateProfile').mockResolvedValue({
        id: 'mentor-1',
        bio: 'Updated bio',
        profileVersion: 2,
      });

      const result = await controller.updateProfile(mockRequest, AuthRole.MENTOR, dto);

      expect(result).toEqual({ id: 'mentor-1', bio: 'Updated bio', profileVersion: 2 });
      expect(service.updateProfile).toHaveBeenCalledWith(
        'user-id-123',
        AuthRole.MENTOR,
        dto,
        {
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
        },
        undefined,
      );
    });
  });

  describe('assignRole', () => {
    it('should assign a role to a user', async () => {
      jest.spyOn(service, 'assignRole').mockResolvedValue(mockUser);

      const result = await controller.assignRole('user-id-123', AuthRole.MENTOR);

      expect(result).toEqual(mockUser);
      expect(service.assignRole).toHaveBeenCalledWith('user-id-123', AuthRole.MENTOR);
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(service, 'assignRole').mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.assignRole('bad-id', AuthRole.MENTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeRole', () => {
    it('should revoke a role from a user', async () => {
      const userWithoutRole = { ...mockUser, roles: [] };
      jest.spyOn(service, 'revokeRole').mockResolvedValue(userWithoutRole);

      const result = await controller.revokeRole('user-id-123', AuthRole.MENTOR);

      expect(result).toEqual(userWithoutRole);
      expect(service.revokeRole).toHaveBeenCalledWith('user-id-123', AuthRole.MENTOR);
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(service, 'revokeRole').mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.revokeRole('bad-id', AuthRole.MENTOR)).rejects.toThrow(NotFoundException);
    });
  });
});
