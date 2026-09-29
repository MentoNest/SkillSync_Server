import { Test, TestingModule } from '@nestjs/testing';
import { PaginationService } from './pagination.service.js';
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

  describe('offset/limit pagination', () => {
    it('should handle page=1, limit=20 correctly', async () => {
      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([Array(20).fill({}), 150]),
      } as unknown as SelectQueryBuilder<any>;

      const result = await service.paginate(mockQueryBuilder, 1, 20);

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(150);
      expect(result.meta.totalPages).toBe(8);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.hasPrev).toBe(false);
      expect(result.links.prev).toBeNull();
      expect(result.links.next).toBe('?page=2&limit=20');
    });

    it('should enforce max limit of 100', async () => {
      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([Array(100).fill({}), 500]),
      } as unknown as SelectQueryBuilder<any>;

      const result = await service.paginate(mockQueryBuilder, 1, 200);

      expect(result.meta.limit).toBe(100);
      expect(result.meta.totalPages).toBe(5);
    });

    it('should handle page beyond total pages', async () => {
      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 50]),
      } as unknown as SelectQueryBuilder<any>;

      const result = await service.paginate(mockQueryBuilder, 10, 10);

      expect(result.meta.page).toBe(10);
      expect(result.meta.total).toBe(50);
      expect(result.meta.totalPages).toBe(5);
      expect(result.meta.hasNext).toBe(false);
      expect(result.links.next).toBeNull();
    });

    it('should handle negative page by clamping to 1', async () => {
      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([Array(10).fill({}), 50]),
      } as unknown as SelectQueryBuilder<any>;

      const result = await service.paginate(mockQueryBuilder, -5, 10);

      expect(result.meta.page).toBe(1);
    });

    it('should normalize non-finite and fractional pagination values', async () => {
      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      } as unknown as SelectQueryBuilder<any>;

      const result = await service.paginate(
        mockQueryBuilder,
        Number.NaN,
        Infinity,
      );

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(1);
    });

    it('should honor a valid configurable max limit', async () => {
      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      } as unknown as SelectQueryBuilder<any>;

      const result = await service.paginate(mockQueryBuilder, 1, 20, {
        maxLimit: 5,
      });

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
      expect(result.meta.limit).toBe(5);
    });
  });

  describe('cursor-based pagination', () => {
    it('should return nextCursor when there are more results', async () => {
      const mockItems = Array(101)
        .fill(0)
        .map((_, i) => ({ id: 1000 - i }));
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockItems),
      } as unknown as SelectQueryBuilder<any>;

      const result = await service.paginateWithCursor(
        mockQueryBuilder,
        'id',
        100,
      );

      expect(result.data.length).toBe(100);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(901);
    });

    it('should return null nextCursor when at the end', async () => {
      const mockItems = Array(50)
        .fill(0)
        .map((_, i) => ({ id: 50 - i }));
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockItems),
      } as unknown as SelectQueryBuilder<any>;

      const result = await service.paginateWithCursor(
        mockQueryBuilder,
        'id',
        100,
      );

      expect(result.data.length).toBe(50);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should apply a zero-valued cursor and normalize an invalid limit', async () => {
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as unknown as SelectQueryBuilder<any>;

      await service.paginateWithCursor(mockQueryBuilder, 'id', Number.NaN, 0);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('id < :cursor', {
        cursor: 0,
      });
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(2);
    });
  });
});
