import { Injectable, BadRequestException } from '@nestjs/common';
import { SelectQueryBuilder, Repository, FindManyOptions, ObjectLiteral } from 'typeorm';

/** Default and maximum allowed page sizes */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type PrimitiveQueryValue = string | number | boolean;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationLinks {
  first: string;
  prev: string | null;
  next: string | null;
  last: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
  links?: PaginationLinks;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  limit: number;
}

export interface PaginateOptions {
  maxLimit?: number;
  route?: string;
  query?: Record<string, PrimitiveQueryValue | null | undefined>;
}

@Injectable()
export class PaginationService {
  private async paginateSource<T extends ObjectLiteral>(
    source: SelectQueryBuilder<T> | Repository<T>,
    page = 1,
    limit = DEFAULT_LIMIT,
    options: PaginateOptions & { findOptions?: FindManyOptions<T> } = {},
  ): Promise<PaginatedResponse<T>> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = this.normalizeLimit(limit, options.maxLimit);

    const [data, total] = this.isRepository(source)
      ? await source.findAndCount({
          ...(options.findOptions ?? {}),
          skip: (safePage - 1) * safeLimit,
          take: safeLimit,
        })
      : await source
          .skip((safePage - 1) * safeLimit)
          .take(safeLimit)
          .getManyAndCount();

    return this.buildResponse(data, total, safePage, safeLimit, options);
  }

  /**
   * Offset/limit pagination against a TypeORM QueryBuilder.
   *
   * @param queryBuilder  - must NOT already have skip/take applied
   * @param page          - 1-indexed page number (default 1)
   * @param limit         - items per page (default 20, max 100)
   */
  async paginate<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    page = 1,
    limit = DEFAULT_LIMIT,
    options: PaginateOptions = {},
  ): Promise<PaginatedResponse<T>> {
    return this.paginateSource(queryBuilder, page, limit, options);
  }

  /**
   * Offset/limit pagination against a TypeORM Repository.
   */
  async paginateRepository<T extends ObjectLiteral>(
    repo: Repository<T>,
    page = 1,
    limit = DEFAULT_LIMIT,
    findOptions: FindManyOptions<T> = {},
    options: PaginateOptions = {},
  ): Promise<PaginatedResponse<T>> {
    return this.paginateSource(repo, page, limit, {
      ...options,
      findOptions,
    });
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
    if (!this.isValidBase64(cursor)) {
      throw new BadRequestException('Invalid cursor value');
    }

    return Buffer.from(cursor, 'base64').toString('utf-8');
  }

  private buildResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
    options: PaginateOptions,
  ): PaginatedResponse<T> {
    const totalPages = Math.ceil(total / limit) || 1;
    const links = options.route
      ? this.generatePaginationLinks(page, limit, totalPages, options.route, options.query)
      : undefined;

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
      links,
    };
  }

  generatePaginationLinks(
    page: number,
    limit: number,
    totalPages: number,
    route: string,
    query: Record<string, PrimitiveQueryValue | null | undefined> = {},
  ): PaginationLinks {
    const createLink = (targetPage: number) => {
      const params = new URLSearchParams();

      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }

      params.set('page', String(targetPage));
      params.set('limit', String(limit));

      return `${route}?${params.toString()}`;
    };

    return {
      first: createLink(1),
      prev: page > 1 ? createLink(page - 1) : null,
      next: page < totalPages ? createLink(page + 1) : null,
      last: createLink(totalPages),
    };
  }

  private normalizeLimit(limit: number, maxLimit = MAX_LIMIT): number {
    return Math.min(Math.max(1, Math.floor(limit)), maxLimit);
  }

  private isRepository<T extends ObjectLiteral>(
    value: SelectQueryBuilder<T> | Repository<T>,
  ): value is Repository<T> {
    return 'findAndCount' in value;
  }

  private isValidBase64(value: string): boolean {
    if (!value || value.length % 4 !== 0) {
      return false;
    }

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      return false;
    }

    return Buffer.from(Buffer.from(value, 'base64').toString('utf-8')).toString('base64') === value;
  }
}
