import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CursorPage,
  CursorPaginationOptions,
  CursorQueryBuilder,
  PaginateableSource,
  PaginatedResponse,
  PaginationLinks,
  PaginationMeta,
  PaginationOptions,
} from './pagination.interface';

export const PAGINATION_OPTIONS_TOKEN = Symbol('PAGINATION_OPTIONS');

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_LIMIT = 100;

/** Reusable offset/cursor pagination helpers (#1693). */
@Injectable()
export class PaginationService {
  private readonly options: PaginationOptions;

  constructor(
    @Optional() @Inject(PAGINATION_OPTIONS_TOKEN) options: PaginationOptions = {},
  ) {
    this.options = options ?? {};
  }

  /** Clamp a page number: negative, zero and non-integer values become page 1. */
  normalizePage(page?: number): number {
    return typeof page === 'number' && Number.isFinite(page) && page >= 1
      ? Math.floor(page)
      : 1;
  }

  /** Clamp a limit to `[1, maxLimit]`; invalid values use the default limit. */
  normalizeLimit(limit?: number, maxLimit: number = this.options.maxLimit ?? DEFAULT_MAX_LIMIT): number {
    const fallback = this.options.defaultLimit ?? DEFAULT_LIMIT;
    if (typeof limit !== 'number' || !Number.isFinite(limit)) return Math.min(fallback, maxLimit);
    return Math.max(1, Math.min(Math.floor(limit), maxLimit));
  }

  /** Number of rows to skip for a 1-based page. */
  getOffset(page?: number, limit?: number): number {
    return (this.normalizePage(page) - 1) * this.normalizeLimit(limit);
  }

  getTotalPages(total: number, limit: number): number {
    return total <= 0 ? 0 : Math.ceil(total / this.normalizeLimit(limit));
  }

  buildMeta(page: number, limit: number, total: number): PaginationMeta {
    const currentPage = this.normalizePage(page);
    const pageSize = this.normalizeLimit(limit);
    const totalPages = this.getTotalPages(total, pageSize);
    return {
      page: currentPage,
      limit: pageSize,
      total,
      totalPages,
      hasNext: currentPage < totalPages,
      hasPrev: currentPage > 1 && totalPages > 0,
    };
  }

  /**
   * Apply skip/take to a TypeORM QueryBuilder or repository and return the
   * standard `{ data, meta }` envelope.
   */
  async paginate<T>(
    source: PaginateableSource<T>,
    page: number = this.options.page ?? 1,
    limit: number = this.options.defaultLimit ?? DEFAULT_LIMIT,
    options: PaginationOptions = {},
  ): Promise<PaginatedResponse<T>> {
    const currentPage = this.normalizePage(page);
    const pageSize = this.normalizeLimit(limit, options.maxLimit ?? this.options.maxLimit);
    const skip = this.getOffset(currentPage, pageSize);

    const [rows, total] = 'getManyAndCount' in source
      ? await source.skip(skip).take(pageSize).getManyAndCount()
      : await source.findAndCount({ skip, take: pageSize });

    return { data: rows, meta: this.buildMeta(currentPage, pageSize, total) };
  }

  /** Build first/prev/next/last URLs while preserving existing query params. */
  buildLinks(
    baseUrl: string,
    page: number,
    limit: number,
    totalPages: number,
  ): PaginationLinks {
    const currentPage = this.normalizePage(page);
    const pageSize = this.normalizeLimit(limit);
    const urlFor = (targetPage: number): string => {
      const url = new URL(baseUrl);
      url.searchParams.set('page', String(targetPage));
      url.searchParams.set('limit', String(pageSize));
      return url.toString();
    };

    const lastPage = Math.max(totalPages, 1);
    return {
      first: urlFor(1),
      prev: currentPage > 1 ? urlFor(currentPage - 1) : null,
      next: currentPage < lastPage ? urlFor(currentPage + 1) : null,
      last: urlFor(lastPage),
    };
  }

  encodeCursor(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  decodeCursor(cursor: string): string {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  }

  /**
   * Keyset (cursor) pagination for large datasets. Fetches one extra row to
   * determine `hasMore` without a COUNT query.
   */
  async paginateCursor<T>(
    source: CursorQueryBuilder<T>,
    options: CursorPaginationOptions = {},
  ): Promise<CursorPage<T>> {
    const alias = options.alias ?? 'entity';
    const column = options.cursorColumn ?? 'id';
    const columnRef = `${alias}.${column}`;
    const pageSize = this.normalizeLimit(options.limit, options.maxLimit);
    const decoded = options.cursor ? this.decodeCursor(options.cursor) : null;

    let query = source.orderBy(columnRef, 'ASC');
    if (decoded) {
      query = query.andWhere(`${columnRef} > :cursor`, { cursor: decoded });
    }

    const rows = await query.take(pageSize + 1).getMany();
    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const cursorValue = (row: T): string =>
      String((row as Record<string, unknown>)[column] ?? '');

    return {
      data: pageRows,
      nextCursor: hasMore && pageRows.length > 0 ? this.encodeCursor(cursorValue(pageRows[pageRows.length - 1])) : null,
      prevCursor: decoded ? this.encodeCursor(cursorValue(pageRows[0])) : null,
      hasMore,
      limit: pageSize,
    };
  }
}
