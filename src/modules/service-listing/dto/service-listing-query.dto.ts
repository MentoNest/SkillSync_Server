import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsArray, Max, Min } from 'class-validator';
import { ServiceCategory } from '../entities/service-listing.entity';
import { CurrencyCode } from '../../../common/enums/currency-code.enum';
import { ListingApprovalStatus } from '../../../common/enums/skill-status.enum';

export enum ServiceListingSort {
  RELEVANCE = 'relevance',
  PRICE = 'price',
  RATING = 'rating',
  NEWEST = 'newest'
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

export class ServiceListingQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search by title or description keyword' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: 'Filter by category', enum: ServiceCategory })
  @IsOptional()
  @IsEnum(ServiceCategory)
  category?: ServiceCategory;

  @ApiPropertyOptional({ description: 'Filter by currency code', enum: CurrencyCode, example: CurrencyCode.USD })
  @IsOptional()
  @IsEnum(CurrencyCode)
  @Transform(({ value }) => value?.trim().toUpperCase())
  currency?: CurrencyCode;

  @ApiPropertyOptional({ description: 'Filter by tags (array of tag slugs)', example: ['typescript', 'nodejs'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Minimum price filter' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price filter' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Minimum duration in hours' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minDuration?: number;

  @ApiPropertyOptional({ description: 'Maximum duration in hours' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxDuration?: number;

  @ApiPropertyOptional({ description: 'Filter by approval status (admin only)', enum: ListingApprovalStatus })
  @IsOptional()
  @IsEnum(ListingApprovalStatus)
  approvalStatus?: ListingApprovalStatus;

  @ApiPropertyOptional({ description: 'Sort by field', enum: ServiceListingSort, default: ServiceListingSort.RELEVANCE })
  @IsOptional()
  @IsEnum(ServiceListingSort)
  sortBy?: ServiceListingSort = ServiceListingSort.RELEVANCE;

  @ApiPropertyOptional({ description: 'Sort order', enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}

export class ServiceListingPaginationMetaDto {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export class PaginatedServiceListingsDto<T> {
  data: T[];
  meta: ServiceListingPaginationMetaDto;
}
