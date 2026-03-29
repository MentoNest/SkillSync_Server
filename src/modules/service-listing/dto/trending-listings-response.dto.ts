import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ServiceListing } from '../entities/service-listing.entity';

export class TrendingListingsResponseDto {
  @ApiProperty({ description: 'List of trending service listings', type: [ServiceListing] })
  @Type(() => ServiceListing)
  listings: ServiceListing[];

  @ApiProperty({ description: 'Pagination metadata' })
  meta: {
    total: number;
    limit: number;
    offset: number;
    pages: number;
    currentPage: number;
  };
}
