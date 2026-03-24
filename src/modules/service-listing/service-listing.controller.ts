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
  @ApiOperation({ summary: 'Get all service listings' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 20 })
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
  @ApiOperation({ summary: 'Delete service listing' })
  @ApiResponse({ status: 200, description: 'Service listing deleted successfully' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  remove(@Param('id') id: string, @Request() req) {
    return this.serviceListingService.remove(id, req.user.id);
  }
}
