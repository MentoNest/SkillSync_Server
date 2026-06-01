import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { PaginatedResponse, PaginationOptions } from './interfaces/paginated-response.interface';

@Injectable()
export class PaginationService {
  private readonly defaultMaxLimit = 100;

  async paginate<T>(
    queryBuilder: SelectQueryBuilder<T>,
    page: number = 1,
    limit: number = 10,
    options: PaginationOptions = {},
  ): Promise<PaginatedResponse<T>> {
    const maxLimit = options.maxLimit || this.defaultMaxLimit;
    const safeLimit = Math.min(Math.max(1, limit), maxLimit);
    const safePage = Math.max(1, page);

    let data: T[];
    let total: number;

    if (options.cursorField && options.cursor) {
      // Cursor-based pagination
      const cursorField = options.cursorField;
      const cursor = options.cursor;

      queryBuilder.andWhere(`${queryBuilder.alias}.${cursorField} < :cursor`, { cursor });
      queryBuilder.orderBy(`${queryBuilder.alias}.${cursorField}`, 'DESC');
      queryBuilder.take(safeLimit);

      [data, total] = await Promise.all([
        queryBuilder.getMany(),
        queryBuilder.getCount(), // Note: total count might be expensive for large datasets
      ]);
    } else {
      // Offset-based pagination
      [data, total] = await queryBuilder
        .skip((safePage - 1) * safeLimit)
        .take(safeLimit)
        .getManyAndCount();
    }

    const totalPages = Math.ceil(total / safeLimit);

    const meta = {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
      nextCursor:
        options.cursorField && data.length === safeLimit
          ? (data[data.length - 1] as any)[options.cursorField]
          : undefined,
    };

    const response: PaginatedResponse<T> = { data, meta };

    if (options.route && !options.cursorField) {
      response.links = this.generateLinks(options.route, safePage, safeLimit, totalPages);
    }

    return response;
  }

  private generateLinks(route: string, page: number, limit: number, totalPages: number) {
    const baseUrl = route.includes('?') ? route : `${route}?`;
    
    return {
      first: `${baseUrl}page=1&limit=${limit}`,
      prev: page > 1 ? `${baseUrl}page=${page - 1}&limit=${limit}` : null,
      next: page < totalPages ? `${baseUrl}page=${page + 1}&limit=${limit}` : null,
      last: `${baseUrl}page=${totalPages}&limit=${limit}`,
    };
  }
}
