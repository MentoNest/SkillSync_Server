import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingResponseDto } from './dto/listing-response.dto';
import { MentorGuard } from '../guards/auth/mentor.guard';
import { CurrentMentorProfile } from '../decorators/auth/current-mentor-profile.decorator';

@ApiTags('Mentor Listings')
@ApiBearerAuth()
@Controller('mentor/listings')
@UseGuards(MentorGuard)
export class MentorListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new listing' })
  @ApiResponse({
    status: 201,
    description: 'Listing created successfully',
    type: ListingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @CurrentMentorProfile() mentorProfileId: string,
    @Body() createListingDto: CreateListingDto,
  ): Promise<ListingResponseDto> {
    return this.listingsService.create(mentorProfileId, createListingDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all listings for the current mentor' })
  @ApiResponse({
    status: 200,
    description: 'Listings retrieved successfully',
    type: [ListingResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @CurrentMentorProfile() mentorProfileId: string,
  ): Promise<ListingResponseDto[]> {
    return this.listingsService.findAll(mentorProfileId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific listing' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({
    status: 200,
    description: 'Listing retrieved successfully',
    type: ListingResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async findOne(
    @CurrentMentorProfile() mentorProfileId: string,
    @Param('id') id: string,
  ): Promise<ListingResponseDto> {
    return this.listingsService.findOne(id, mentorProfileId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a listing' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({
    status: 200,
    description: 'Listing updated successfully',
    type: ListingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async update(
    @CurrentMentorProfile() mentorProfileId: string,
    @Param('id') id: string,
    @Body() updateListingDto: UpdateListingDto,
  ): Promise<ListingResponseDto> {
    return this.listingsService.update(id, mentorProfileId, updateListingDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a listing' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({ status: 204, description: 'Listing deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async remove(
    @CurrentMentorProfile() mentorProfileId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.listingsService.remove(id, mentorProfileId);
  }
}
