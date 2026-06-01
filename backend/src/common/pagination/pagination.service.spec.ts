import { Test, TestingModule } from '@nestjs/testing';
import { PaginationService } from './pagination.service';
import { SelectQueryBuilder } from 'typeorm';

describe('PaginationService', () => {
  let service: PaginationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaginationService],
    }).compile();

    service = module.get<PaginationService>(PaginationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should paginate results correctly', async () => {
    const mockData = [{ id: 1 }, { id: 2 }];
    const mockTotal = 20;

    const mockQueryBuilder = {
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([mockData, mockTotal]),
    } as unknown as SelectQueryBuilder<any>;

    const result = await service.paginate(mockQueryBuilder, 1, 10);

    expect(result.data).toEqual(mockData);
    expect(result.meta.total).toBe(mockTotal);
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(10);
    expect(result.meta.totalPages).toBe(2);
    expect(result.meta.hasNext).toBe(true);
    expect(result.meta.hasPrev).toBe(false);
  });

  it('should handle negative page and limit', async () => {
    const mockQueryBuilder = {
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    } as unknown as SelectQueryBuilder<any>;

    const result = await service.paginate(mockQueryBuilder, -1, -5);

    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(1);
  });

  it('should enforce max limit', async () => {
    const mockQueryBuilder = {
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    } as unknown as SelectQueryBuilder<any>;

    const result = await service.paginate(mockQueryBuilder, 1, 1000, { maxLimit: 50 });

    expect(result.meta.limit).toBe(50);
  });

  it('should generate links when route is provided', async () => {
    const mockQueryBuilder = {
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 20]),
    } as unknown as SelectQueryBuilder<any>;

    const result = await service.paginate(mockQueryBuilder, 1, 10, { route: '/test' });

    expect(result.links).toBeDefined();
    expect(result.links?.first).toContain('page=1');
    expect(result.links?.next).toContain('page=2');
  });

  it('should handle page beyond total', async () => {
    const mockQueryBuilder = {
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 5]),
    } as unknown as SelectQueryBuilder<any>;

    const result = await service.paginate(mockQueryBuilder, 10, 10);

    expect(result.data).toEqual([]);
    expect(result.meta.page).toBe(10);
    expect(result.meta.totalPages).toBe(1);
    expect(result.meta.hasNext).toBe(false);
    expect(result.meta.hasPrev).toBe(true);
  });

  it('should support cursor-based pagination', async () => {
    const mockData = [{ id: 10, createdAt: '2023-01-02' }, { id: 9, createdAt: '2023-01-01' }];
    const mockTotal = 100;

    const mockQueryBuilder = {
      alias: 'test',
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(mockData),
      getCount: jest.fn().mockResolvedValue(mockTotal),
    } as unknown as SelectQueryBuilder<any>;

    const result = await service.paginate(mockQueryBuilder, 1, 2, {
      cursorField: 'createdAt',
      cursor: '2023-01-03',
    });

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('test.createdAt < :cursor', {
      cursor: '2023-01-03',
    });
    expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('test.createdAt', 'DESC');
    expect(result.data).toEqual(mockData);
    expect(result.meta.nextCursor).toBe('2023-01-01');
  });
});
