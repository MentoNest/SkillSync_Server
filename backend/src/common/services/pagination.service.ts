import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder, Repository } from 'typeorm';

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  links: {
    first: string;
    prev: string | null;
    next: string | null;
    last: string;
  };
}

export interface PaginationOptions {
  baseUrl?: string;
  maxLimit?: number;
}

@Injectable()
export class PaginationService {
  private readonly DEFAULT_MAX_LIMIT = 100;

  async paginate<T>(
    queryBuilderOrRepository: SelectQueryBuilder<T> | Repository<T>,
    page: number = 1,
    limit: number = 20,
    options: PaginationOptions = {},
  ): Promise<PaginatedResponse<T>> {
    const maxLimit = options.maxLimit || this.DEFAULT_MAX_LIMIT;
    const safeLimit = Math.min(Math.max(limit, 1), maxLimit);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    // Get query builder if repository was provided
    const queryBuilder = 'createQueryBuilder' in queryBuilderOrRepository
      ? queryBuilderOrRepository.createQueryBuilder('entity')
      : queryBuilderOrRepository;

    // Apply pagination
    queryBuilder.skip(skip).take(safeLimit);

    // Execute queries
    const [data, total] = await queryBuilder.getManyAndCount();

    const totalPages = Math.ceil(total / safeLimit);
    const hasNext = safePage < totalPages;
    const hasPrev = safePage > 1;

    // Generate pagination links if baseUrl is provided
    const baseUrl = options.baseUrl || '';
    const createLink = (p: number) => `${baseUrl}?page=${p}&limit=${safeLimit}`;

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
      links: {
        first: createLink(1),
        prev: hasPrev ? createLink(safePage - 1) : null,
        next: hasNext ? createLink(safePage + 1) : null,
        last: createLink(Math.max(totalPages, 1)),
      },
    };
  }

  // Cursor-based pagination for large datasets
  async paginateWithCursor<T>(
    queryBuilder: SelectQueryBuilder<T>,
    cursorField: string,
    limit: number = 100,
    cursor?: string | number,
    order: 'ASC' | 'DESC' = 'DESC',
  ): Promise<{
    data: T[];
    nextCursor: string | number | null;
    hasMore: boolean;
  }> {
    const safeLimit = Math.min(limit, this.DEFAULT_MAX_LIMIT);
    
    if (cursor) {
      queryBuilder.andWhere(`${cursorField} ${order === 'DESC' ? '<' : '>'} :cursor`, { cursor });
    }

    // Take one extra to check if there's more
    queryBuilder.take(safeLimit + 1);
    queryBuilder.orderBy(cursorField, order);

    const results = await queryBuilder.getMany();
    const hasMore = results.length > safeLimit;
    const data = hasMore ? results.slice(0, safeLimit) : results;
    const nextCursor = hasMore ? (data[data.length - 1] as any)[cursorField] : null;

    return {
      data,
      nextCursor,
      hasMore,
    };
  }
}