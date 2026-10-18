import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { REDIS } from '../../redis/redis.module';
import { RoleName } from '../../rbac/roles';
import { User, UserStatus } from '../entities/user.entity';
import { SortOrder, UserSearchQueryDto, UserSortBy } from './dto/user-search-query.dto';
import { SEARCH_CACHE_TTL_SECONDS, UserSearchService } from './user-search.service';

describe('UserSearchService', () => {
  let service: UserSearchService;
  const qb = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getManyAndCount: jest.fn(),
  };
  const users = { createQueryBuilder: jest.fn(() => qb) };
  const redis = { get: jest.fn(), set: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const method of [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ] as const) {
      qb[method].mockReturnValue(qb);
    }
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSearchService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: REDIS, useValue: redis },
      ],
    }).compile();

    service = module.get(UserSearchService);
  });

  it('applies default pagination and reports metadata', async () => {
    qb.getManyAndCount.mockResolvedValue([[{ id: 'u1', roles: [], displayName: 'A', avatarUrl: null }], 45]);
    const result = await service.search(new UserSearchQueryDto());

    expect(result).toMatchObject({ page: 1, limit: 20, total: 45, totalPages: 3 });
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
  });

  it('clamps limit to the maximum of 100', async () => {
    const query = Object.assign(new UserSearchQueryDto(), { limit: 500 });
    await service.search(query);
    expect(qb.take).toHaveBeenCalledWith(100);
  });

  it('filters by role using the joined role name', async () => {
    const query = Object.assign(new UserSearchQueryDto(), { role: RoleName.MENTOR });
    await service.search(query);
    expect(qb.andWhere).toHaveBeenCalledWith('role.name = :role', { role: RoleName.MENTOR });
  });

  it('does a case-insensitive partial display-name match', async () => {
    const query = Object.assign(new UserSearchQueryDto(), { search: 'Ali' });
    await service.search(query);
    expect(qb.andWhere).toHaveBeenCalledWith('user.displayName ILIKE :search', { search: '%Ali%' });
  });

  it('applies the skill filter to mentor profiles', async () => {
    const query = Object.assign(new UserSearchQueryDto(), { skill: 'typescript' });
    await service.search(query);
    expect(qb.andWhere).toHaveBeenCalledWith(':skill = ANY(mentor.skills)', { skill: 'typescript' });
  });

  it('sorts mentors by rating when requested', async () => {
    const query = Object.assign(new UserSearchQueryDto(), { sortBy: UserSortBy.RATING, sortOrder: SortOrder.ASC });
    await service.search(query);
    expect(qb.orderBy).toHaveBeenCalledWith('mentor.averageRating', 'ASC');
  });

  it('returns cached results without hitting the database', async () => {
    const cached = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    redis.get.mockResolvedValue(JSON.stringify(cached));
    const result = await service.search(new UserSearchQueryDto());
    expect(result).toEqual(cached);
    expect(users.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('caches fresh results for 60 seconds and excludes sensitive fields', async () => {
    qb.getManyAndCount.mockResolvedValue([
      [
        {
          id: 'u1',
          displayName: 'Ada',
          avatarUrl: null,
          walletAddress: 'SECRET',
          email: 'ada@example.com',
          status: UserStatus.ACTIVE,
          roles: [{ name: 'mentor' }],
          mentorProfile: {
            isVerified: true,
            skills: ['ts'],
            expertiseAreas: [],
            averageRating: '4.50',
            reviewCount: 3,
            hourlyRate: '50.00',
          },
        },
      ],
      1,
    ]);
    const result = await service.search(new UserSearchQueryDto());

    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining('users:search:'), expect.any(String), 'EX', SEARCH_CACHE_TTL_SECONDS);
    expect(result.data[0]).not.toHaveProperty('walletAddress');
    expect(result.data[0]).not.toHaveProperty('email');
    expect(result.data[0].mentorProfile?.averageRating).toBe(4.5);
    expect(result.data[0].roles).toEqual(['mentor']);
  });

  it('reports zero total pages for an empty result set', async () => {
    const result = await service.search(new UserSearchQueryDto());
    expect(result.totalPages).toBe(0);
  });
});
