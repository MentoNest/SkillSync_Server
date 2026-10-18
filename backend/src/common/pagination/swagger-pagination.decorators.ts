import { applyDecorators } from '@nestjs/common';
import { ApiParameter } from '@nestjs/swagger';
import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from './dto/pagination-query.dto';

/** Documents `?page=` on an endpoint that returns a paginated list (#1461). */
export const ApiPageQuery = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiParameter({
      name: 'page',
      required: false,
      in: 'query',
      description: '1-based page number.',
      schema: { type: 'integer', minimum: 1, default: DEFAULT_PAGE },
    }),
  );

/** Documents `?limit=` on an endpoint that returns a paginated list (#1461). */
export const ApiLimitQuery = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiParameter({
      name: 'limit',
      required: false,
      in: 'query',
      description: `Rows per page (capped at ${MAX_LIMIT}).`,
      schema: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
    }),
  );

/** Documents both paging parameters; use alongside `@Query() dto: PaginationQueryDto`. */
export const ApiPaginationQuery = (): MethodDecorator & ClassDecorator =>
  applyDecorators(ApiPageQuery(), ApiLimitQuery());