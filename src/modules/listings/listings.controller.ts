import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ListingsService } from './providers/listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingStatus, ListingType } from './entities/listing.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new listing with duplicate detection' })
  @ApiResponse({ status: 201, description: 'Listing created successfully' })
  @ApiResponse({ status: 409, description: 'Duplicate listing detected' })
  async create(@Body() createListingDto: CreateListingDto, @Request() req) {
    return this.listingsService.create(createListingDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all active listings' })
  @ApiQuery({ name: 'type', required: false, enum: ListingType })
  @ApiQuery({ name: 'skills', required: false, description: 'Comma-separated skills' })
  @ApiQuery({ name: 'minRate', required: false, type: Number })
  @ApiQuery({ name: 'maxRate', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of listings' })
  async findAll(
    @Query('type') type?: ListingType,
    @Query('skills') skills?: string,
    @Query('minRate') minRate?: number,
    @Query('maxRate') maxRate?: number,
  ) {
    const filters = {
      type,
      skills: skills ? skills.split(',').map(s => s.trim()) : undefined,
      minRate,
      maxRate,
    };
    return this.listingsService.findAll(filters);
  }

  @Get('my-listings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user listings' })
  @ApiResponse({ status: 200, description: 'List of user listings' })
  async findMyListings(@Request() req) {
    return this.listingsService.findByUserId(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get listing by ID' })
  @ApiResponse({ status: 200, description: 'Listing found' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async findOne(@Param('id') id: string) {
    return this.listingsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update listing' })
  @ApiResponse({ status: 200, description: 'Listing updated successfully' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @ApiResponse({ status: 409, description: 'Duplicate listing detected' })
  async update(
    @Param('id') id: string,
    @Body() updateListingDto: UpdateListingDto,
    @Request() req,
  ) {
    const listing = await this.listingsService.findOne(id);
    
    // Verify user owns this listing
    if (listing.userId !== req.user.id) {
      throw new Error('Unauthorized to update this listing');
    }
    
    return this.listingsService.update(id, updateListingDto, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove listing (soft delete)' })
  @ApiResponse({ status: 204, description: 'Listing removed successfully' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async remove(@Param('id') id: string, @Request() req) {
    const listing = await this.listingsService.findOne(id);
    
    // Verify user owns this listing
    if (listing.userId !== req.user.id) {
      throw new Error('Unauthorized to remove this listing');
    }
    
    await this.listingsService.remove(id, req.user.id);
  }

  @Get('stats/duplicates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get duplicate detection statistics' })
  @ApiResponse({ status: 200, description: 'Duplicate statistics' })
  async getDuplicateStats() {
    return this.listingsService.getDuplicateStats();
  }
}
