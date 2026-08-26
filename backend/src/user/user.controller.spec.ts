import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, ProfileType } from './entities/user.entity';
import { Role } from '../entities/role.entity';

describe('UserController', () => {
  let controller: UserController;
  let mockUserService: any;

  beforeEach(async () => {
    mockUserService = {
      create: jest.fn(),
      findUserResponseById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: JwtService,
          useValue: { verify: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Role),
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return user response for authenticated user', async () => {
      const mockUserEntity: any = { id: 'user-123', email: 'test@example.com' };
      const expectedResponse = {
        id: 'user-123',
        email: 'test@example.com',
        profileType: ProfileType.MENTEE,
        settings: {},
        isLocked: false,
        lockoutUntil: null,
        lastLoginAt: null,
        roles: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUserService.findUserResponseById.mockResolvedValue(expectedResponse);

      const result = await controller.getProfile(mockUserEntity);
      expect(result).toEqual(expectedResponse);
      expect(mockUserService.findUserResponseById).toHaveBeenCalledWith('user-123');
    });
  });
});
