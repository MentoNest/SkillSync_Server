import { Injectable, BadRequestException } from '@nestjs/common';
import { SelectQueryBuilder, Repository } from 'typeorm';
import { PaginatedResponse } from './pagination.interface';
import { PaginationQueryDto } from './pagination.dto';

export interface PaginationOptions {
  route?: string;
}

@Injectable()
export class PaginationService {
  async paginate<T>(
    queryBuilderOrRepository: SelectQueryBuilder<T> | Repository<T>,
    paginationQuery: PaginationQueryDto,
    options?: PaginationOptions,
  ): Promise<PaginatedResponse<T>> {
    const page = paginationQuery.page && paginationQuery.page > 0 ? paginationQuery.page : 1;
    const limit = paginationQuery.limit && paginationQuery.limit > 0 ? paginationQuery.limit : 10;
    
    // Validate edge cases
    if (page < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    let items: T[] = [];
    let total = 0;

    const skip = (page - 1) * limit;

    if (queryBuilderOrRepository instanceof Repository) {
      [items, total] = await queryBuilderOrRepository.findAndCount({
        skip,
        take: limit,
      });
    } else {
      [items, total] = await queryBuilderOrRepository
        .skip(skip)
        .take(limit)
        .getManyAndCount();
    }

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    // Optional link generation if a route is provided
    let links;
    if (options?.route) {
      const baseUrl = options.route;
      links = {
        first: `${baseUrl}?page=1&limit=${limit}`,
        prev: hasPrev ? `${baseUrl}?page=${page - 1}&limit=${limit}` : null,
        next: hasNext ? `${baseUrl}?page=${page + 1}&limit=${limit}` : null,
        last: totalPages > 0 ? `${baseUrl}?page=${totalPages}&limit=${limit}` : `${baseUrl}?page=1&limit=${limit}`,
      };
    }

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
      ...(links && { links }),
    };
  }
}
