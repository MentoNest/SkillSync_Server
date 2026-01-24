import { Test, TestingModule } from '@nestjs/testing';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from '../users/entities/user.entity';

describe('ProfileController', () => {
  let controller: ProfileController;
  let service: ProfileService;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    password: 'hashedpassword',
    name: 'Test User',
    bio: 'Test bio',
    avatarUrl: 'https://example.com/avatar.jpg',
    timezone: 'UTC',
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-24'),
  };

  const mockProfileService = {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  };

  const mockRequest = {
    user: mockUser,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        {
          provide: ProfileService,
          useValue: mockProfileService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<ProfileController>(ProfileController);
    service = module.get<ProfileService>(ProfileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /me', () => {
    it('should return current user profile', async () => {
      mockProfileService.getProfile.mockResolvedValue(mockUser);

      const result = await controller.getProfile(mockRequest);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.name).toBe(mockUser.name);
      expect(result.bio).toBe(mockUser.bio);
      expect(result.avatarUrl).toBe(mockUser.avatarUrl);
      expect(result.timezone).toBe(mockUser.timezone);
      expect(service.getProfile).toHaveBeenCalledWith(mockUser.id);
      expect(service.getProfile).toHaveBeenCalledTimes(1);
    });

    it('should not expose password in response', async () => {
      mockProfileService.getProfile.mockResolvedValue(mockUser);

      const result = await controller.getProfile(mockRequest);

      expect(result).not.toHaveProperty('password');
    });

    it('should throw error when user not found', async () => {
      mockProfileService.getProfile.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(controller.getProfile(mockRequest)).rejects.toThrow(
        'User not found',
      );
      expect(service.getProfile).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('PATCH /me', () => {
    it('should update user profile successfully', async () => {
      const updateDto: UpdateProfileDto = {
        name: 'Updated Name',
        bio: 'Updated bio',
      };

      const updatedUser = { ...mockUser, ...updateDto };
      mockProfileService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile(mockRequest, updateDto);

      expect(result.name).toBe('Updated Name');
      expect(result.bio).toBe('Updated bio');
      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto,
      );
      expect(service.updateProfile).toHaveBeenCalledTimes(1);
    });

    it('should update only name', async () => {
      const updateDto: UpdateProfileDto = {
        name: 'Only Name Changed',
      };

      const updatedUser = { ...mockUser, name: 'Only Name Changed' };
      mockProfileService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile(mockRequest, updateDto);

      expect(result.name).toBe('Only Name Changed');
      expect(result.bio).toBe(mockUser.bio);
      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto,
      );
    });

    it('should update only bio', async () => {
      const updateDto: UpdateProfileDto = {
        bio: 'New bio content',
      };

      const updatedUser = { ...mockUser, bio: 'New bio content' };
      mockProfileService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile(mockRequest, updateDto);

      expect(result.bio).toBe('New bio content');
      expect(result.name).toBe(mockUser.name);
      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto,
      );
    });

    it('should update avatarUrl', async () => {
      const updateDto: UpdateProfileDto = {
        avatarUrl: 'https://newurl.com/avatar.png',
      };

      const updatedUser = {
        ...mockUser,
        avatarUrl: 'https://newurl.com/avatar.png',
      };
      mockProfileService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile(mockRequest, updateDto);

      expect(result.avatarUrl).toBe('https://newurl.com/avatar.png');
      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto,
      );
    });

    it('should update timezone', async () => {
      const updateDto: UpdateProfileDto = {
        timezone: 'America/Chicago',
      };

      const updatedUser = { ...mockUser, timezone: 'America/Chicago' };
      mockProfileService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile(mockRequest, updateDto);

      expect(result.timezone).toBe('America/Chicago');
      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto,
      );
    });

    it('should update all fields at once', async () => {
      const updateDto: UpdateProfileDto = {
        name: 'All Fields',
        bio: 'All fields bio',
        avatarUrl: 'https://all.com/avatar.jpg',
        timezone: 'Asia/Tokyo',
      };

      const updatedUser = { ...mockUser, ...updateDto };
      mockProfileService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile(mockRequest, updateDto);

      expect(result.name).toBe(updateDto.name);
      expect(result.bio).toBe(updateDto.bio);
      expect(result.avatarUrl).toBe(updateDto.avatarUrl);
      expect(result.timezone).toBe(updateDto.timezone);
      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto,
      );
    });

    it('should not expose password in update response', async () => {
      const updateDto: UpdateProfileDto = {
        name: 'Test',
      };

      const updatedUser = { ...mockUser, name: 'Test' };
      mockProfileService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateProfile(mockRequest, updateDto);

      expect(result).not.toHaveProperty('password');
    });

    it('should handle empty update dto', async () => {
      const updateDto: UpdateProfileDto = {};

      mockProfileService.updateProfile.mockResolvedValue(mockUser);

      const result = await controller.updateProfile(mockRequest, updateDto);

      expect(result).toBeDefined();
      expect(service.updateProfile).toHaveBeenCalledWith(mockUser.id, {});
    });
  });
});