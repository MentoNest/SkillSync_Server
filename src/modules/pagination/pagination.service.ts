import { Injectable, BadRequestException } from '@nestjs/common';
import { SelectQueryBuilder, Repository, FindManyOptions } from 'typeorm';

/** Default and maximum allowed page sizes */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  limit: number;
}

export interface PaginateOptions {
  /** Override the default column used for ordering (default: 'id') */
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

@Injectable()
export class PaginationService {
  /**
   * Offset/limit pagination against a TypeORM QueryBuilder.
   *
   * @param queryBuilder  - must NOT already have skip/take applied
   * @param page          - 1-indexed page number (default 1)
   * @param limit         - items per page (default 20, max 100)
   */
  async paginate<T>(
    queryBuilder: SelectQueryBuilder<T>,
    page = 1,
    limit = DEFAULT_LIMIT,
    options: PaginateOptions = {},
  ): Promise<PaginatedResponse<T>> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);

    const [data, total] = await queryBuilder
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    return this.buildResponse(data, total, safePage, safeLimit);
  }

  /**
   * Offset/limit pagination against a TypeORM Repository.
   */
  async paginateRepository<T>(
    repo: Repository<T>,
    page = 1,
    limit = DEFAULT_LIMIT,
    findOptions: FindManyOptions<T> = {},
  ): Promise<PaginatedResponse<T>> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);

    const [data, total] = await repo.findAndCount({
      ...findOptions,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return this.buildResponse(data, total, safePage, safeLimit);
  }

  /**
   * Cursor-based pagination for high-performance scenarios.
   *
   * Cursors are opaque base64-encoded strings containing the cursor column value.
   * The `cursorColumn` should be indexed (e.g. `id`, `createdAt`).
   *
   * @param queryBuilder  - base query, must NOT have where/order/skip/take for cursor fields
   * @param limit         - items per page (max 100)
   * @param afterCursor   - fetch items after this cursor (forward pagination)
   * @param beforeCursor  - fetch items before this cursor (backward pagination)
   * @param cursorColumn  - column name to use as cursor (default: 'id')
   * @param alias         - QueryBuilder alias (default: 'entity')
   */
  async cursorPaginate<T extends Record<string, any>>(
    queryBuilder: SelectQueryBuilder<T>,
    limit = DEFAULT_LIMIT,
    afterCursor?: string,
    beforeCursor?: string,
    cursorColumn = 'id',
    alias = 'entity',
  ): Promise<CursorPage<T>> {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);

    const decodedAfter = afterCursor ? this.decodeCursor(afterCursor) : null;
    const decodedBefore = beforeCursor ? this.decodeCursor(beforeCursor) : null;

    if (decodedAfter) {
      queryBuilder.andWhere(`${alias}.${cursorColumn} > :after`, { after: decodedAfter });
    }

    if (decodedBefore) {
      queryBuilder.andWhere(`${alias}.${cursorColumn} < :before`, { before: decodedBefore });
    }

    queryBuilder.orderBy(`${alias}.${cursorColumn}`, 'ASC').take(safeLimit + 1);

    const rows = await queryBuilder.getMany();

    const hasMore = rows.length > safeLimit;
    const data = hasMore ? rows.slice(0, safeLimit) : rows;

    const nextCursor =
      hasMore && data.length > 0
        ? this.encodeCursor(String(data[data.length - 1][cursorColumn]))
        : null;

    const prevCursor =
      decodedAfter && data.length > 0
        ? this.encodeCursor(String(data[0][cursorColumn]))
        : null;

    return { data, nextCursor, prevCursor, limit: safeLimit };
  }

  /** Encode a cursor value to an opaque base64 string */
  encodeCursor(value: string): string {
    return Buffer.from(value).toString('base64');
  }

  /** Decode an opaque base64 cursor back to its raw value */
  decodeCursor(cursor: string): string {
    try {
      return Buffer.from(cursor, 'base64').toString('utf-8');
    } catch {
      throw new BadRequestException('Invalid cursor value');
    }
  }

  private buildResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResponse<T> {
    const totalPages = Math.ceil(total / limit) || 1;
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }
}
