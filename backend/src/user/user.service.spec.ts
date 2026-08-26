import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { User, ProfileType } from './entities/user.entity';
import { Role } from '../entities/role.entity';
import { NotFoundException } from '@nestjs/common';

describe('UserService', () => {
  let service: UserService;
  let mockUserRepository: any;
  let mockRoleRepository: any;

  beforeEach(async () => {
    mockUserRepository = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((user) => Promise.resolve({ id: 'uuid-123', ...user })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      remove: jest.fn().mockResolvedValue(true),
      update: jest.fn().mockResolvedValue(true),
    };

    mockRoleRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'role-1', name: 'mentee' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Role),
          useValue: mockRoleRepository,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findById', () => {
    it('should return user if found', async () => {
      const mockUser = { id: 'uuid-123', email: 'test@example.com', roles: [] };
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findById('uuid-123');
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('incrementTokenVersion', () => {
    it('should increment user token version', async () => {
      const mockUser = { id: 'uuid-123', tokenVersion: 1 };
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockImplementation((u: any) => Promise.resolve(u));

      const newVersion = await service.incrementTokenVersion('uuid-123');
      expect(newVersion).toBe(2);
    });
  });
});
