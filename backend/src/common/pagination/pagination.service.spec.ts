import { PaginationService } from './pagination.service';

describe('PaginationService (#1693)', () => {
  const service = new PaginationService();

  function queryBuilder(total: number) {
    const rows = Array.from({ length: Math.min(total, 10) }, (_, i) => ({
      id: i + 1,
    }));
    return {
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    };
  }

  function repository(total: number) {
    return {
      findAndCount: jest.fn().mockResolvedValue([[], total]),
    };
  }

  it('normalizes pages and limits, including negative and invalid values', () => {
    expect(service.normalizePage(undefined)).toBe(1);
    expect(service.normalizePage(-5)).toBe(1);
    expect(service.normalizePage(3.9)).toBe(3);
    expect(service.normalizeLimit(0)).toBe(1);
    expect(service.normalizeLimit(1000)).toBe(100);
    expect(service.normalizeLimit(Number.NaN)).toBe(20);
    expect(service.normalizeLimit(50, 25)).toBe(25);
  });

  it('applies skip/take and returns a full meta object', async () => {
    const qb = queryBuilder(95);
    const result = await service.paginate(qb, 3, 20);

    expect(qb.skip).toHaveBeenCalledWith(40);
    expect(qb.take).toHaveBeenCalledWith(20);
    expect(result.meta).toEqual({
      page: 3,
      limit: 20,
      total: 95,
      totalPages: 5,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('supports repositories via findAndCount', async () => {
    const repo = repository(12);
    const result = await service.paginate(repo, 1, 10);
    expect(repo.findAndCount).toHaveBeenCalledWith({ skip: 0, take: 10 });
    expect(result.meta.totalPages).toBe(2);
    expect(result.meta.hasNext).toBe(true);
  });

  it('handles a page beyond the total and an empty collection', async () => {
    const qb = queryBuilder(0);
    const result = await service.paginate(qb, 7, 20);

    expect(qb.skip).toHaveBeenCalledWith(120);
    expect(result.meta).toMatchObject({
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });

  it('builds first/prev/next/last links preserving the base query', () => {
    const links = service.buildLinks(
      'https://api.skillsync.dev/users?role=mentor',
      2,
      20,
      5,
    );

    expect(links.prev).toContain('page=1');
    expect(links.prev).toContain('role=mentor');
    expect(links.next).toContain('page=3');
    expect(links.first).toContain('page=1');
    expect(links.last).toContain('page=5');
    expect(
      service.buildLinks('https://api.skillsync.dev/users', 1, 20, 1).prev,
    ).toBeNull();
    expect(
      service.buildLinks('https://api.skillsync.dev/users', 1, 20, 1).next,
    ).toBeNull();
  });

  it('encodes and decodes cursors', () => {
    const cursor = service.encodeCursor('2026-11-22T10:00:00.000Z');
    expect(service.decodeCursor(cursor)).toBe('2026-11-22T10:00:00.000Z');
  });

  it('paginates by cursor without a count query', async () => {
    const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };

    const first = await service.paginateCursor(qb, { limit: 2, alias: 'user' });
    expect(qb.orderBy).toHaveBeenCalledWith('user.id', 'ASC');
    expect(first.data).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(service.decodeCursor(first.nextCursor!)).toBe('2');

    qb.getMany.mockResolvedValue([{ id: '3' }]);
    const second = await service.paginateCursor(qb, {
      limit: 2,
      alias: 'user',
      cursor: first.nextCursor!,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('user.id > :cursor', {
      cursor: '2',
    });
    expect(second.data).toEqual([{ id: '3' }]);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
    expect(second.prevCursor).not.toBeNull();
  });
});
