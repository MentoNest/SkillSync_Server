import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../pagination/dto/pagination-query.dto';

/**
 * Reusable base for every request DTO in the codebase (#1460).
 *
 * Keeping these in one place means a new endpoint extends a base rather than
 * re-deriving the same decorators, and it gives Swagger a single description of
 * the shared paging contract.
 */
export class BaseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search term', maxLength: 120 })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @MinLength(1, { message: 'q must not be empty' })
  @MaxLength(120, { message: 'q must be 120 characters or fewer' })
  q?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

/** Base for DTOs that identify a single resource by uuid. */
export class BaseIdDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @MinLength(1)
  id?: string;
}

/** Paging + integer bounds shared by numeric-filter DTOs. */
export class BaseNumericFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max?: number;
}