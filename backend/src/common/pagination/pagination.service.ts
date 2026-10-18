import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SelectQueryBuilder } from 'typeorm';
import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from './dto/pagination-query.dto';
import type {
  CursorMeta,
  CursorPaginatedResponse,
  PaginateOptions,
  PaginatedResponse,
  PaginationLinks,
  PaginationMeta,
  ResolvedPage,
} from './types/pagination.types';

/**
 * Standardises offset/limit and cursor pagination across every list endpoint
 * (#1461).
 *
 * Everything here is deliberately tolerant rather than throwing: list endpoints
 * that receive `page=0` or `limit=99999` from a hand-written URL get a sensible
 * clamped result instead of a 500. Reject-with-400 behaviour is the job of
 * {@link PaginationQueryDto} plus the global ValidationPipe.
 */
@Injectable()
export class PaginationService {
  private readonly maxLimit: number;

  constructor(@Optional() config?: ConfigService) {
    const configured = parseInt(config?.get<string>('PAGINATION_MAX_LIMIT') ?? '', 10);
    this.maxLimit = Number.isFinite(configured) && configured > 0 ? configured : MAX_LIMIT;
  }

  /** Clamps caller-supplied paging values into a usable range. */
  resolvePage(page?: number, limit?: number, maxLimit?: number): ResolvedPage {
    const ceiling = maxLimit && maxLimit > 0 ? maxLimit : this.maxLimit;

    const safePage = Number.isFinite(page) && (page as number) >= 1 ? Math.floor(page as number) : DEFAULT_PAGE;
    const rawLimit = Number.isFinite(limit) && (limit as number) >= 1 ? Math.floor(limit as number) : DEFAULT_LIMIT;
    const safeLimit = Math.min(rawLimit, ceiling);

    return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
  }

  /** Runs an offset/limited `getManyAndCount` and wraps the result. */
  async paginate<T>(
    qb: SelectQueryBuilder<T>,
    page?: number,
    limit?: number,
    options: PaginateOptions = {},
  ): Promise<PaginatedResponse<T>> {
    const resolved = this.resolvePage(page, limit, options.maxLimit);

    qb.skip(resolved.skip).take(resolved.limit);
    const [data, total] = await qb.getManyAndCount();

    const meta = this.buildMeta(resolved, total);
    const response: PaginatedResponse<T> = { data, meta };

    if (options.links !== false) {
      response.links = this.buildLinks(meta, options.path, options.query);
    }
    return response;
  }

  /**
   * Keyset pagination for very large or frequently-mutating collections.
   *
   * `cursorColumn` must be unique and monotonically ordered; callers encode the
   * last seen value into the cursor so rows inserted during paging cannot
   * shift or duplicate results the way `OFFSET` does.
   */
  async paginateCursor<T>(
    qb: SelectQueryBuilder<T>,
    options: PaginateOptions & { cursorColumn: string; cursor?: string | null; cursorParam?: string },
  ): Promise<CursorPaginatedResponse<T>> {
    const { cursorColumn, cursor } = options;
    const resolved = this.resolvePage(1, options.limit, options.maxLimit);
    const direction = cursor?.startsWith('-') ? 'DESC' : 'ASC';
    const value = cursor && direction === 'DESC' ? cursor.slice(1) : (cursor ?? null);

    if (value !== null) {
      qb.andWhere(
        direction === 'DESC'
          ? `${cursorColumn} < :cursorValue`
          : `${cursorColumn} > :cursorValue`,
        { cursorValue: value },
      );
    }

    // Fetch one extra row to learn whether another page exists without a COUNT.
    qb.orderBy(cursorColumn, direction).take(resolved.limit + 1);
    const rows = await qb.getMany();
    const hasNext = rows.length > resolved.limit;
    const data = hasNext ? rows.slice(0, resolved.limit) : rows;

    const last = data.length ? (data[data.length - 1] as Record<string, unknown>)[cursorColumn] : null;
    const first = data.length ? (data[0] as Record<string, unknown>)[cursorColumn] : null;

    const meta: CursorMeta = {
      limit: resolved.limit,
      hasNext,
      hasPrev: value !== null,
      nextCursor: hasNext && last !== null ? encodeCursor(last) : null,
      prevCursor: value !== null && first !== null ? encodeCursor(first, true) : null,
    };

    return { data, meta };
  }

  buildMeta(resolved: ResolvedPage, total: number): PaginationMeta {
    const totalPages = resolved.limit > 0 ? Math.ceil(total / resolved.limit) : 0;
    return {
      page: resolved.page,
      limit: resolved.limit,
      total,
      totalPages,
      hasNext: resolved.page < totalPages,
      hasPrev: resolved.page > 1 && total > 0,
    };
  }

  /** Builds `first` / `prev` / `self` / `next` / `last` links, null when unavailable. */
  buildLinks(
    meta: PaginationMeta,
    path = '',
    query: Record<string, string | number | boolean | undefined> = {},
  ): PaginationLinks {
    const build = (page: number): string => `${path}${this.toQueryString({ ...query, page, limit: meta.limit })}`;

    return {
      first: meta.total > 0 ? build(1) : null,
      prev: meta.hasPrev ? build(meta.page - 1) : null,
      self: build(meta.page),
      next: meta.hasNext ? build(meta.page + 1) : null,
      last: meta.totalPages > 0 ? build(meta.totalPages) : null,
    };
  }

  private toQueryString(params: Record<string, string | number | boolean | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      search.append(key, String(value));
    }
    const qs = search.toString();
    return qs ? `?${qs}` : '';
  }
}

/** Opaque, URL-safe cursor: base64url of the ordering column value. */
function encodeCursor(value: unknown, descending = false): string {
  const encoded = Buffer.from(String(value), 'utf8').toString('base64url');
  return descending ? `-${encoded}` : encoded;
}