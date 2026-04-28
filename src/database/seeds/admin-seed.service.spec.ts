import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AdminSeedService, SeedResult } from './admin-seed.service';
import { Role } from '../../modules/auth/entities/role.entity';
import { User } from '../../modules/auth/entities/user.entity';

describe('AdminSeedService', () => {
  let service: AdminSeedService;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockRoleRepository: jest.Mocked<any>;
  let mockUserRepository: jest.Mocked<any>;
  let mockQueryRunner: any;

  const mockAdminWallet = '0x742d35Cc6634C0532925a3b844Bc2e7c6A9A8B0F';
  const normalizedWallet = '0x742d35cc6634c0532925a3b844bc2e7c6a9a8b0f';

  beforeEach(async () => {
    // Setup mock query runner
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      manager: {
        save: jest.fn(),
      },
    };

    // Setup mock data source
    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    } as any;

    // Setup mock config service
    mockConfigService = {
      get: jest.fn(),
    } as any;

    // Setup mock repositories
    mockRoleRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    mockUserRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSeedService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(Role),
          useValue: mockRoleRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<AdminSeedService>(AdminSeedService);
  });

  describe('seed', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should skip seeding when DISABLE_SEED is true', async () => {
      mockConfigService.get.mockReturnValueOnce('true');

      const result = await service.seed();

      expect(result.roleCreated).toBe(false);
      expect(result.roleAlreadyExists).toBe(true);
      expect(result.userCreated).toBe(false);
      expect(result.userAlreadyExists).toBe(true);
      expect(result.message).toBe('Seeding disabled');
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('should create admin role and user successfully', async () => {
      const adminRoleId = '123e4567-e89b-12d3-a456-426614174000';
      const adminUserId = '223e4567-e89b-12d3-a456-426614174000';

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'DISABLE_SEED') return undefined;
        if (key === 'DEFAULT_ADMIN_WALLET') return mockAdminWallet;
        return undefined;
      });

      const mockRole = { id: adminRoleId, name: 'admin' };
      const mockUser = { id: adminUserId, walletAddress: normalizedWallet };

      mockRoleRepository.create.mockReturnValue(mockRole);
      mockUserRepository.create.mockReturnValue(mockUser);

      // Mock role doesn't exist
      mockQueryRunner.query
        .mockResolvedValueOnce([]) // No existing role
        .mockResolvedValueOnce(undefined); // Save role

      // Mock user doesn't exist
      mockQueryRunner.query
        .mockResolvedValueOnce([]) // No existing user
        .mockResolvedValueOnce(undefined) // Save user
        .mockResolvedValueOnce(undefined); // Insert user_role

      mockQueryRunner.manager.save
        .mockResolvedValueOnce(mockRole)
        .mockResolvedValueOnce(mockUser);

      const result = await service.seed();

      expect(result.roleCreated).toBe(true);
      expect(result.userCreated).toBe(true);
      expect(result.message).toContain('Admin role created');
      expect(result.message).toContain('Admin user created');
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should handle existing admin role', async () => {
      const adminRoleId = '123e4567-e89b-12d3-a456-426614174000';

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'DISABLE_SEED') return undefined;
        if (key === 'DEFAULT_ADMIN_WALLET') return mockAdminWallet;
        return undefined;
      });

      const mockRole = { id: adminRoleId, name: 'admin' };

      mockRoleRepository.create.mockReturnValue(mockRole);

      // Mock role already exists
      mockQueryRunner.query
        .mockResolvedValueOnce([mockRole]) // Existing role found
        .mockResolvedValueOnce([]); // No existing user

      const mockUser = { id: '223e4567-e89b-12d3-a456-426614174000', walletAddress: normalizedWallet };
      mockUserRepository.create.mockReturnValue(mockUser);
      mockQueryRunner.manager.save.mockResolvedValueOnce(mockUser);

      const result = await service.seed();

      expect(result.roleCreated).toBe(false);
      expect(result.roleAlreadyExists).toBe(true);
      expect(result.message).toContain('Admin role already exists');
    });

    it('should skip user creation when DEFAULT_ADMIN_WALLET is not set', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const adminRoleId = '123e4567-e89b-12d3-a456-426614174000';
      const mockRole = { id: adminRoleId, name: 'admin' };

      mockRoleRepository.create.mockReturnValue(mockRole);

      // Mock role doesn't exist
      mockQueryRunner.query.mockResolvedValueOnce([]);
      mockQueryRunner.manager.save.mockResolvedValueOnce(mockRole);

      const result = await service.seed();

      expect(result.roleCreated).toBe(true);
      expect(result.userCreated).toBe(false);
      expect(result.message).toContain('Admin user not created');
    });

    it('should rollback transaction on error', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      mockQueryRunner.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.seed()).rejects.toThrow('Database error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
