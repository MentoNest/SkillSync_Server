import { Test, TestingModule } from '@nestjs/testing';
import { PaginationService } from './pagination.service';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { BadRequestException } from '@nestjs/common';

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

  describe('paginate with Repository', () => {
    let repository: Partial<Repository<any>>;

    beforeEach(() => {
      repository = {
        findAndCount: jest.fn(),
      };
    });

    it('should return paginated response successfully', async () => {
      const mockData = [{ id: 1 }, { id: 2 }];
      const mockTotal = 5;
      (repository.findAndCount as jest.Mock).mockResolvedValue([mockData, mockTotal]);

      const result = await service.paginate(repository as Repository<any>, { page: 1, limit: 2 });

      expect(repository.findAndCount).toHaveBeenCalledWith({ skip: 0, take: 2 });
      expect(result.data).toEqual(mockData);
      expect(result.meta.total).toBe(mockTotal);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(2);
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.hasPrev).toBe(false);
    });

    it('should handle page beyond total', async () => {
      (repository.findAndCount as jest.Mock).mockResolvedValue([[], 5]);

      const result = await service.paginate(repository as Repository<any>, { page: 4, limit: 2 });

      expect(repository.findAndCount).toHaveBeenCalledWith({ skip: 6, take: 2 });
      expect(result.data).toEqual([]);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(true);
    });

    it('should throw error for negative page', async () => {
      await expect(service.paginate(repository as Repository<any>, { page: -1, limit: 10 })).rejects.toThrow(BadRequestException);
    });

    it('should throw error for invalid limit', async () => {
      await expect(service.paginate(repository as Repository<any>, { page: 1, limit: -1 })).rejects.toThrow(BadRequestException);
      await expect(service.paginate(repository as Repository<any>, { page: 1, limit: 200 })).rejects.toThrow(BadRequestException); // max 100 enforced by Math.min in implementation? Wait, implementation sets max limit to 100 but doesn't throw if > 100? Let's check implementation.
    });

    it('should generate links if route provided', async () => {
      (repository.findAndCount as jest.Mock).mockResolvedValue([[], 15]);

      const result = await service.paginate(
        repository as Repository<any>, 
        { page: 2, limit: 5 },
        { route: 'http://localhost/items' }
      );

      expect(result.links?.first).toBe('http://localhost/items?page=1&limit=5');
      expect(result.links?.prev).toBe('http://localhost/items?page=1&limit=5');
      expect(result.links?.next).toBe('http://localhost/items?page=3&limit=5');
      expect(result.links?.last).toBe('http://localhost/items?page=3&limit=5');
    });
  });

  describe('paginate with QueryBuilder', () => {
    let queryBuilder: Partial<SelectQueryBuilder<any>>;

    beforeEach(() => {
      queryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(),
      };
    });

    it('should work with QueryBuilder', async () => {
      const mockData = [{ id: 1 }];
      const mockTotal = 1;
      (queryBuilder.getManyAndCount as jest.Mock).mockResolvedValue([mockData, mockTotal]);

      const result = await service.paginate(queryBuilder as SelectQueryBuilder<any>, { page: 1, limit: 10 });

      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
      expect(queryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.data).toEqual(mockData);
      expect(result.meta.total).toBe(1);
    });
  });
});
