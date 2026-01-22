import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ListingsService } from './listings.service';
import { SearchListingsDto } from './dto/search-listing.dto';
import { PaginatedListingsResponseDto } from './dto/listing-response.dto';

@ApiTags('Public Listings')
@Controller('listings')
export class PublicListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search and filter listings',
    description:
      'Public endpoint to browse listings with pagination and filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Listings retrieved successfully',
    type: PaginatedListingsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  async search(
    @Query() searchDto: SearchListingsDto,
  ): Promise<PaginatedListingsResponseDto> {
    return this.listingsService.search(searchDto);
  }
}
