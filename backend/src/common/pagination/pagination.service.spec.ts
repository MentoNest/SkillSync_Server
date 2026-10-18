import { ConfigService } from '@nestjs/config';
import type { SelectQueryBuilder } from 'typeorm';
import { PaginationService } from './pagination.service';

interface Row {
  id: number;
  name: string;
}

function createQb(rows: Row[], total?: number): SelectQueryBuilder<Row> {
  const qb = {
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total ?? rows.length]),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return qb as unknown as SelectQueryBuilder<Row>;
}

describe('PaginationService', () => {
  let service: PaginationService;

  beforeEach(() => {
    service = new PaginationService();
  });

  describe('resolvePage', () => {
    it('defaults when nothing is supplied', () => {
      expect(service.resolvePage()).toEqual({ page: 1, limit: 20, skip: 0 });
    });

    it('computes skip from page and limit', () => {
      expect(service.resolvePage(3, 10)).toEqual({ page: 3, limit: 10, skip: 20 });
    });

    it('clamps a negative page to the first page', () => {
      expect(service.resolvePage(-5, 10)).toEqual({ page: 1, limit: 10, skip: 0 });
    });

    it('clamps page zero to the first page', () => {
      expect(service.resolvePage(0, 10).page).toBe(1);
    });

    it('falls back to the default limit when limit is zero or negative', () => {
      expect(service.resolvePage(1, 0).limit).toBe(20);
      expect(service.resolvePage(1, -3).limit).toBe(20);
    });

    it('enforces the max limit ceiling', () => {
      expect(service.resolvePage(1, 10_000).limit).toBe(100);
    });

    it('honours a per-call max limit override', () => {
      expect(service.resolvePage(1, 50, 25).limit).toBe(25);
    });

    it('truncates fractional values instead of producing a fractional skip', () => {
      expect(service.resolvePage(2.9, 10.7)).toEqual({ page: 2, limit: 10, skip: 10 });
    });

    it('treats NaN and Infinity as unset', () => {
      expect(service.resolvePage(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
        page: 1,
        limit: 20,
        skip: 0,
      });
    });

    it('reads the ceiling from PAGINATION_MAX_LIMIT when provided', () => {
      const configured = new PaginationService({
        get: (key: string) => (key === 'PAGINATION_MAX_LIMIT' ? '250' : undefined),
      } as unknown as ConfigService);
      expect(configured.resolvePage(1, 1_000).limit).toBe(250);
    });

    it('ignores an unusable PAGINATION_MAX_LIMIT value', () => {
      const configured = new PaginationService({
        get: () => 'not-a-number',
      } as unknown as ConfigService);
      expect(configured.resolvePage(1, 1_000).limit).toBe(100);
    });
  });

  describe('paginate', () => {
    it('applies skip/take and returns data plus meta', async () => {
      const rows: Row[] = [{ id: 1, name: 'a' }];
      const qb = createQb(rows, 1);

      const result = await service.paginate(qb, 1, 10, { links: false });

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('reports hasNext/hasPrev correctly in the middle of the set', async () => {
      const qb = createQb([{ id: 3, name: 'c' }], 25);
      const result = await service.paginate(qb, 2, 10, { links: false });

      expect(result.meta).toMatchObject({ page: 2, totalPages: 3, hasNext: true, hasPrev: true });
    });

    it('handles a page beyond the end without error', async () => {
      const qb = createQb([], 5);
      const result = await service.paginate(qb, 99, 10, { links: false });

      expect(result.data).toEqual([]);
      expect(result.meta).toMatchObject({ page: 99, total: 5, totalPages: 1, hasNext: false, hasPrev: true });
    });

    it('returns zero totalPages for an empty result set', async () => {
      const qb = createQb([], 0);
      const result = await service.paginate(qb, 1, 10, { links: false });
      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.hasPrev).toBe(false);
    });
  });

  describe('buildLinks', () => {
    it('produces first/prev/self/next/last for a middle page', () => {
      const links = service.buildLinks(
        { page: 2, limit: 10, total: 25, totalPages: 3, hasNext: true, hasPrev: true },
        '/users',
      );

      expect(links).toEqual({
        first: '/users?page=1&limit=10',
        prev: '/users?page=1&limit=10',
        self: '/users?page=2&limit=10',
        next: '/users?page=3&limit=10',
        last: '/users?page=3&limit=10',
      });
    });

    it('nulls prev on the first page and next on the last', () => {
      const first = service.buildLinks(
        { page: 1, limit: 10, total: 25, totalPages: 3, hasNext: true, hasPrev: false },
        '/users',
      );
      expect(first.prev).toBeNull();
      expect(first.next).toBe('/users?page=2&limit=10');

      const last = service.buildLinks(
        { page: 3, limit: 10, total: 25, totalPages: 3, hasNext: false, hasPrev: true },
        '/users',
      );
      expect(last.next).toBeNull();
      expect(last.prev).toBe('/users?page=2&limit=10');
    });

    it('keeps caller-supplied query parameters on every link', () => {
      const links = service.buildLinks(
        { page: 2, limit: 10, total: 25, totalPages: 3, hasNext: true, hasPrev: true },
        '/users',
        { role: 'mentor', page: undefined },
      );
      expect(links.next).toBe('/users?role=mentor&page=3&limit=10');
    });

    it('nulls first and last when there is nothing to page through', () => {
      const links = service.buildLinks(
        { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        '/users',
      );
      expect(links.first).toBeNull();
      expect(links.last).toBeNull();
      expect(links.self).toBe('/users?page=1&limit=10');
    });
  });

  describe('paginateCursor', () => {
    it('fetches one extra row and truncates it', async () => {
      const rows: Row[] = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, name: `n${i + 1}` }));
      const qb = createQb(rows);

      const result = await service.paginateCursor(qb, { cursorColumn: 'id', limit: 3 });

      expect(qb.take).toHaveBeenCalledWith(4);
      expect(result.data).toHaveLength(3);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.nextCursor).not.toBeNull();
    });

    it('reports no next page when the extra row is absent', async () => {
      const qb = createQb([{ id: 1, name: 'a' }]);
      const result = await service.paginateCursor(qb, { cursorColumn: 'id', limit: 10 });

      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
    });

    it('filters ascending on the cursor value when a cursor is supplied', async () => {
      const rows: Row[] = [{ id: 10, name: 'j' }];
      const qb = createQb(rows);
      const cursor = Buffer.from('5', 'utf8').toString('base64url');

      const result = await service.paginateCursor(qb, { cursorColumn: 'id', cursor, limit: 10 });

      expect(qb.andWhere).toHaveBeenCalledWith('id > :cursorValue', { cursorValue: '5' });
      expect(qb.orderBy).toHaveBeenCalledWith('id', 'ASC');
      expect(result.meta.hasPrev).toBe(true);
    });

    it('filters descending for a negated cursor', async () => {
      const rows: Row[] = [{ id: 1, name: 'a' }];
      const qb = createQb(rows);
      const cursor = '-' + Buffer.from('5', 'utf8').toString('base64url');

      const result = await service.paginateCursor(qb, { cursorColumn: 'id', cursor, limit: 10 });

      expect(qb.andWhere).toHaveBeenCalledWith('id < :cursorValue', { cursorValue: '5' });
      expect(qb.orderBy).toHaveBeenCalledWith('id', 'DESC');
      expect(result.meta.prevCursor).not.toBeNull();
    });
  });
});