import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Base query object every list endpoint extends so `page` / `limit` behave
 * identically across modules (#1461).
 *
 * The bounds are intentionally permissive here and clamped by
 * {@link PaginationService}: the pipe only guarantees the value is an integer,
 * the service owns the "max limit" policy so it stays configurable at runtime.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be greater than or equal to 1' })
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be greater than or equal to 1' })
  @Max(MAX_LIMIT, { message: `limit must be less than or equal to ${MAX_LIMIT}` })
  limit?: number;
}