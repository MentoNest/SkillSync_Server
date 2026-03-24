import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ServiceListingService } from './service-listing.service';
import { CreateServiceListingDto } from './dto/create-service-listing.dto';
import { UpdateServiceListingDto } from './dto/update-service-listing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('service-listings')
@ApiBearerAuth()
@Controller('service-listings')
@UseGuards(JwtAuthGuard)
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
  @ApiResponse({ status: 200, description: 'List of service listings' })
  findAll() {
    return this.serviceListingService.findAll();
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

  @Delete(':id')
  @ApiOperation({ summary: 'Delete service listing' })
  @ApiResponse({ status: 200, description: 'Service listing deleted successfully' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  remove(@Param('id') id: string, @Request() req) {
    return this.serviceListingService.remove(id, req.user.id);
  }
}
