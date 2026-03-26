import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ServiceListingService } from './service-listing.service';
import { CreateServiceListingDto } from './dto/create-service-listing.dto';
import { UpdateServiceListingDto } from './dto/update-service-listing.dto';
import { ToggleFeaturedDto } from './dto/toggle-featured.dto';
import { ToggleListingVisibilityDto } from './dto/toggle-listing-visibility.dto';
import { ServiceListingQueryDto } from './dto/service-listing-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('service-listings')
@ApiBearerAuth()
@Controller('service-listings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServiceListingController {
  constructor(private readonly serviceListingService: ServiceListingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new service listing' })
  @ApiResponse({ status: 201, description: 'Listing created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  create(@Body() createServiceListingDto: CreateServiceListingDto, @Request() req) {
    return this.serviceListingService.create(createServiceListingDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Search and list service listings' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 20 })
  @ApiQuery({ name: 'keyword', required: false, description: 'Search by title or description' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category', enum: ['technical', 'business', 'design', 'marketing', 'career', 'language', 'other'] })
  @ApiQuery({ name: 'minPrice', required: false, description: 'Minimum price', example: 10 })
  @ApiQuery({ name: 'maxPrice', required: false, description: 'Maximum price', example: 500 })
  @ApiQuery({ name: 'minDuration', required: false, description: 'Minimum duration in hours', example: 1 })
  @ApiQuery({ name: 'maxDuration', required: false, description: 'Maximum duration in hours', example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated list of service listings' })
  findAll(@Query() query: ServiceListingQueryDto) {
    return this.serviceListingService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get service listing by ID' })
  @ApiResponse({ status: 200, description: 'Service listing found' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  findOne(@Param('id') id: string) {
    return this.serviceListingService.findOne(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get service listing by slug' })
  @ApiResponse({ status: 200, description: 'Service listing found' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  findBySlug(@Param('slug') slug: string) {
    return this.serviceListingService.findBySlug(slug);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update service listing' })
  @ApiResponse({ status: 200, description: 'Service listing updated successfully' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  update(@Param('id') id: string, @Body() updateServiceListingDto: UpdateServiceListingDto, @Request() req) {
    return this.serviceListingService.update(id, updateServiceListingDto, req.user.id);
  }

  @Patch(':id/featured')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Toggle featured status for a service listing (Admin only)' })
  @ApiResponse({ status: 200, description: 'Featured status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  toggleFeatured(@Param('id') id: string, @Body() toggleFeaturedDto: ToggleFeaturedDto) {
    return this.serviceListingService.toggleFeatured(id, toggleFeaturedDto.isFeatured);
  }

  @Patch(':id/visibility')
  @Roles(UserRole.MENTOR)
  @ApiOperation({ summary: 'Toggle visibility for a service listing' })
  @ApiResponse({ status: 200, description: 'Listing visibility updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Mentor access required' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  toggleVisibility(
    @Param('id') id: string,
    @Body() toggleListingVisibilityDto: ToggleListingVisibilityDto,
    @Request() req,
  ) {
    return this.serviceListingService.toggleVisibility(id, toggleListingVisibilityDto.isActive, req.user.id);
  }

  @Delete(':id')
  @Roles(UserRole.MENTOR)
  @ApiOperation({ summary: 'Soft delete a service listing (owner only)' })
  @ApiResponse({ status: 200, description: 'Service listing deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - you can only delete your own listings' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  remove(@Param('id') id: string, @Request() req) {
    return this.serviceListingService.remove(id, req.user.id);
  }
}
