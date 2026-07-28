import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * #1006/#1007: Reusable base DTO for offset/limit pagination query params.
 * Extend this from any list-endpoint query DTO instead of redeclaring
 * page/limit validation. The upper bound on `limit` is enforced by
 * PaginationService (configurable, default 100) rather than here, so a
 * single DTO works for endpoints with different max-limit policies.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
