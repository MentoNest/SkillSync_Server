import { IsOptional, IsUUID, IsString, IsInt, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Base DTO class with common validation decorators
 * All DTOs should extend this class for consistency
 */
export class BaseDto {
  @IsOptional()
  @IsString()
  id?: string;
}

/**
 * Base UUID parameter DTO for route parameters
 */
export class UUIDParamDto {
  @IsUUID('4')
  id: string;
}

/**
 * Pagination DTO for query parameters
 */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

/**
 * Base query DTO with common query parameter validations
 */
export class BaseQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC';
}
