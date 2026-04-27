import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PaginationService } from './pagination.service';

const makeQb = (rows: any[], total?: number) => ({
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([rows, total ?? rows.length]),
  getMany: jest.fn().mockResolvedValue(rows),
});

const makeRepo = (rows: any[], total?: number) => ({
  findAndCount: jest.fn().mockResolvedValue([rows, total ?? rows.length]),
});

describe('PaginationService', () => {
  let service: PaginationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaginationService],
    }).compile();
    service = module.get<PaginationService>(PaginationService);
  });

  describe('paginate', () => {
    it('returns paginated response with correct meta', async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      const qb = makeQb(rows, 10) as any;

      const result = await service.paginate(qb, 2, 2);

      expect(result.data).toEqual(rows);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(2);
      expect(result.meta.total).toBe(10);
      expect(result.meta.totalPages).toBe(5);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.hasPrev).toBe(true);
    });

    it('clamps page to minimum 1', async () => {
      const qb = makeQb([], 0) as any;
      const result = await service.paginate(qb, -5, 10);
      expect(result.meta.page).toBe(1);
    });

    it('enforces max limit of 100', async () => {
      const qb = makeQb([], 0) as any;
      const result = await service.paginate(qb, 1, 9999);
      expect(result.meta.limit).toBe(100);
    });

    it('hasNext is false on last page', async () => {
      const qb = makeQb([{ id: 1 }], 1) as any;
      const result = await service.paginate(qb, 1, 10);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
    });

    it('page beyond total still returns valid meta', async () => {
      const qb = makeQb([], 5) as any;
      const result = await service.paginate(qb, 100, 10);
      expect(result.meta.page).toBe(100);
      expect(result.meta.hasNext).toBe(false);
    });
  });

  describe('paginateRepository', () => {
    it('calls findAndCount with correct skip/take', async () => {
      const rows = [{ id: 1 }];
      const repo = makeRepo(rows, 30) as any;

      const result = await service.paginateRepository(repo, 3, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.meta.page).toBe(3);
    });
  });

  describe('cursor pagination', () => {
    it('encodes and decodes cursor round-trip', () => {
      const encoded = service.encodeCursor('42');
      expect(service.decodeCursor(encoded)).toBe('42');
    });

    it('throws BadRequestException for invalid cursor', () => {
      // non-base64 input that would fail to decode meaningfully
      expect(() => service.decodeCursor('!!invalid!!')).toThrow(BadRequestException);
    });

    it('returns nextCursor when more rows exist', async () => {
      const rows = [{ id: 1 }, { id: 2 }, { id: 3 }]; // limit=2, hasMore
      const qb = makeQb(rows) as any;

      const result = await service.cursorPaginate(qb, 2);

      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).not.toBeNull();
    });

    it('returns null nextCursor on last page', async () => {
      const rows = [{ id: 1 }]; // limit=2, no more
      const qb = makeQb(rows) as any;

      const result = await service.cursorPaginate(qb, 2);

      expect(result.nextCursor).toBeNull();
    });
  });
});
