import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { User, ProfileType } from './entities/user.entity';
import { Role } from '../entities/role.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { RedisService } from '../auth/services/redis.service';
import { NotFoundException } from '@nestjs/common';

describe('UserService', () => {
  let service: UserService;
  let mockUserRepository: any;
  let mockRoleRepository: any;
  let mockMentorProfileRepository: any;
  let mockRedisService: any;

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
      createQueryBuilder: jest.fn(),
    };

    mockMentorProfileRepository = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(),
    };

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
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
        {
          provide: getRepositoryToken(MentorProfile),
          useValue: mockMentorProfileRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
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

  describe('searchUsers (#1173)', () => {
    let qb: any;
    let roleQb: any;
    let mentorQb: any;

    const mentorUser = {
      id: 'user-1',
      displayName: 'Alex Rivers',
      bio: null,
      avatarUrl: null,
      email: 'alex@example.com',
      walletAddress: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
      roles: [{ name: 'mentor' }],
      createdAt: new Date('2026-01-01'),
    };

    beforeEach(() => {
      qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mentorUser], 1]),
      };
      mockUserRepository.createQueryBuilder.mockReturnValue(qb);

      roleQb = {
        select: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('SELECT roleUser.id FROM role ...'),
      };
      mockRoleRepository.createQueryBuilder.mockReturnValue(roleQb);

      mentorQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('SELECT mentorProfile.userId FROM mentor_profiles ...'),
      };
      mockMentorProfileRepository.createQueryBuilder.mockReturnValue(mentorQb);
    });

    it('should return pagination metadata (total, page, limit, totalPages)', async () => {
      qb.getManyAndCount.mockResolvedValue([[mentorUser], 45]);

      const result = await service.searchUsers({ page: 2, limit: 20 });

      expect(result.total).toBe(45);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(3);
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('should apply default pagination (page 1, limit 20) for missing values', async () => {
      const result = await service.searchUsers({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('should handle pagination edge cases (page 0, limit 0, limit over max)', async () => {
      let result = await service.searchUsers({ page: 0, limit: 0 });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);

      result = await service.searchUsers({ page: 1, limit: 500 });
      expect(result.limit).toBe(100); // clamped to max 100
      expect(qb.take).toHaveBeenCalledWith(100);
    });

    it('should filter by role using a role subquery', async () => {
      await service.searchUsers({ role: 'mentor' });

      expect(mockRoleRepository.createQueryBuilder).toHaveBeenCalled();
      expect(roleQb.where).toHaveBeenCalledWith('LOWER(role.name) = LOWER(:role)');
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('user.id IN'));
      expect(qb.setParameter).toHaveBeenCalledWith('role', 'mentor');
    });

    it('should search displayName with case-insensitive partial matching (ILIKE)', async () => {
      await service.searchUsers({ search: 'alex' });

      expect(qb.andWhere).toHaveBeenCalledWith('user.displayName ILIKE :search', {
        search: '%alex%',
      });
    });

    it('should apply skill filter to mentor profiles only', async () => {
      await service.searchUsers({ skill: 'Solidity' });

      expect(mockMentorProfileRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mentorQb.where).toHaveBeenCalledWith(':skill = ANY(mentorProfile.skills)');
      expect(qb.setParameter).toHaveBeenCalledWith('skill', 'Solidity');
    });

    it('should combine role, search and skill filters', async () => {
      await service.searchUsers({ role: 'mentor', search: 'alex', skill: 'Solidity' });

      expect(qb.andWhere).toHaveBeenCalledTimes(3);
    });

    it('should sort by rating via mentor profile join with NULLS LAST', async () => {
      await service.searchUsers({ sortBy: 'rating', sortOrder: 'desc' });

      expect(qb.leftJoin).toHaveBeenCalledWith(
        MentorProfile,
        'mentorProfile',
        'mentorProfile.userId = user.id',
      );
      expect(qb.orderBy).toHaveBeenCalledWith('mentorProfile.averageRating', 'DESC', 'NULLS LAST');
    });

    it('should sort by name and createdAt with the requested order', async () => {
      await service.searchUsers({ sortBy: 'name', sortOrder: 'asc' });
      expect(qb.orderBy).toHaveBeenCalledWith('user.displayName', 'ASC', 'NULLS LAST');

      await service.searchUsers({ sortBy: 'createdAt', sortOrder: 'desc' });
      expect(qb.orderBy).toHaveBeenCalledWith('user.createdAt', 'DESC');
    });

    it('should hide email and walletAddress for public (non-admin) requests', async () => {
      const result = await service.searchUsers({});

      expect(result.data[0].email).toBeUndefined();
      expect(result.data[0].walletAddress).toBeUndefined();
      expect(result.data[0].displayName).toBe('Alex Rivers');
    });

    it('should include email and walletAddress for admin requests and skip cache', async () => {
      const result = await service.searchUsers({}, true);

      expect(result.data[0].email).toBe('alex@example.com');
      expect(result.data[0].walletAddress).toBe(mentorUser.walletAddress);
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });

    it('should enrich mentor results with skills and average rating', async () => {
      mockMentorProfileRepository.find.mockResolvedValue([
        { userId: 'user-1', skills: ['Solidity'], averageRating: 4.5 },
      ]);

      const result = await service.searchUsers({});

      expect(result.data[0].skills).toEqual(['Solidity']);
      expect(result.data[0].averageRating).toBe(4.5);
    });

    it('should serve cached results from Redis when available', async () => {
      const cached = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      mockRedisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.searchUsers({ role: 'mentee' });

      expect(result).toEqual(cached);
      expect(mockUserRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should cache fresh results with a 1 minute TTL', async () => {
      await service.searchUsers({});

      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('users:search:'),
        expect.any(String),
        60,
      );
    });
  });
});
