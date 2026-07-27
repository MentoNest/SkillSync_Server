import { BadRequestException, Injectable } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  CursorPaginatedResponse,
  PaginatedResponse,
  PaginationLinks,
} from './pagination.interface.js';

export interface PaginateOptions {
  /** Upper bound on `limit`, regardless of what the caller requests. */
  maxLimit?: number;
  defaultLimit?: number;
}

export interface CursorPaginateOptions {
  cursor?: string;
  limit?: number;
  maxLimit?: number;
  order?: 'ASC' | 'DESC';
}

const DEFAULT_MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * #1007: Reusable pagination helper so every list endpoint returns the same
 * `{ data, meta }` shape instead of hand-rolling skip/take + counting.
 */
@Injectable()
export class PaginationService {
  /**
   * Offset/limit pagination. Accepts either a TypeORM Repository (uses
   * findAndCount) or a SelectQueryBuilder (uses getManyAndCount) so callers
   * can add filters/joins/order before handing it off.
   */
  async paginate<T extends object>(
    source: Repository<T> | SelectQueryBuilder<T>,
    page?: number,
    limit?: number,
    options: PaginateOptions = {},
  ): Promise<PaginatedResponse<T>> {
    const { safePage, safeLimit } = this.normalize(page, limit, options);
    const skip = (safePage - 1) * safeLimit;

    let data: T[];
    let total: number;

    if (source instanceof Repository) {
      [data, total] = await source.findAndCount({
        skip,
        take: safeLimit,
      });
    } else {
      [data, total] = await source
        .clone()
        .skip(skip)
        .take(safeLimit)
        .getManyAndCount();
    }

    const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1 && totalPages > 0,
      },
    };
  }

  /**
   * Cursor-based pagination for large/high-throughput datasets where
   * offset counting is too expensive. `cursorColumn` must be a strictly
   * orderable, unique-enough column (e.g. a UUID primary key or timestamp).
   */
  async paginateByCursor<T extends object>(
    qb: SelectQueryBuilder<T>,
    cursorColumn: string,
    options: CursorPaginateOptions = {},
  ): Promise<CursorPaginatedResponse<T>> {
    const maxLimit = options.maxLimit ?? DEFAULT_MAX_LIMIT;
    const limit = Math.min(
      Math.max(this.toPositiveInt(options.limit, DEFAULT_LIMIT), 1),
      maxLimit,
    );
    const order = options.order ?? 'ASC';
    const alias = qb.alias;

    const query = qb
      .clone()
      .orderBy(`${alias}.${cursorColumn}`, order)
      .take(limit + 1);

    if (options.cursor) {
      const cursorValue = this.decodeCursor(options.cursor);
      query.andWhere(
        `${alias}.${cursorColumn} ${order === 'ASC' ? '>' : '<'} :cursorValue`,
        { cursorValue },
      );
    }

    const rows = await query.getMany();
    const hasNext = rows.length > limit;
    const data = hasNext ? rows.slice(0, limit) : rows;
    const lastRow = data[data.length - 1] as
      Record<string, unknown> | undefined;

    return {
      data,
      meta: {
        limit,
        nextCursor:
          hasNext && lastRow ? this.encodeCursor(lastRow[cursorColumn]) : null,
        hasNext,
      },
    };
  }

  /** Builds first/prev/next/last links for a given base URL (query-string free). */
  buildLinks(
    baseUrl: string,
    page: number,
    limit: number,
    totalPages: number,
  ): PaginationLinks {
    const urlFor = (targetPage: number): string => {
      const url = new URL(baseUrl);
      url.searchParams.set('page', String(targetPage));
      url.searchParams.set('limit', String(limit));
      return url.toString();
    };

    return {
      first: urlFor(1),
      prev: page > 1 ? urlFor(page - 1) : null,
      next: totalPages > 0 && page < totalPages ? urlFor(page + 1) : null,
      last: urlFor(Math.max(totalPages, 1)),
    };
  }

  private normalize(
    page: number | undefined,
    limit: number | undefined,
    options: PaginateOptions,
  ): { safePage: number; safeLimit: number } {
    const maxLimit = options.maxLimit ?? DEFAULT_MAX_LIMIT;
    const defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;

    const safePage = Math.max(this.toPositiveInt(page, 1), 1);
    const safeLimit = Math.min(
      Math.max(this.toPositiveInt(limit, defaultLimit), 1),
      maxLimit,
    );

    return { safePage, safeLimit };
  }

  private toPositiveInt(value: number | undefined, fallback: number): number {
    if (value === undefined || value === null) return fallback;
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private encodeCursor(value: unknown): string {
    return Buffer.from(String(value), 'utf-8').toString('base64');
  }

  private decodeCursor(cursor: string): string {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      if (!decoded) throw new Error('empty cursor');
      return decoded;
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }
}
