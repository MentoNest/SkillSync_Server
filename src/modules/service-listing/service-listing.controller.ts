import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request, Query, BadRequestException, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ServiceListingService } from './service-listing.service';
import { CreateServiceListingDto } from './dto/create-service-listing.dto';
import { BulkCreateServiceListingDto } from './dto/bulk-create-service-listing.dto';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit, RateLimits } from '../../common/decorators/rate-limit.decorator';
import { UpdateServiceListingDto } from './dto/update-service-listing.dto';
import { ToggleFeaturedDto } from './dto/toggle-featured.dto';
import { ToggleListingVisibilityDto } from './dto/toggle-listing-visibility.dto';
import { ToggleDraftDto } from './dto/toggle-draft.dto';
import { UploadListingImageResponseDto } from './dto/upload-listing-image-response.dto';
import { ServiceListingQueryDto } from './dto/service-listing-query.dto';
import { ApproveListingDto } from './dto/approve-listing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ListingOwnershipGuard } from './guards/listing-ownership.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('service-listings')
@ApiBearerAuth()
@Controller('service-listings')
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
export class ServiceListingController {
  constructor(private readonly serviceListingService: ServiceListingService) {}

  @Post()
  @RateLimit(RateLimits.NORMAL)
  @ApiOperation({ summary: 'Create a new service listing' })
  @ApiResponse({ status: 201, description: 'Listing created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  create(@Body() createServiceListingDto: CreateServiceListingDto, @Request() req) {
    return this.serviceListingService.create(createServiceListingDto, req.user.id);
  }

  @Post('bulk')
  @RateLimit(RateLimits.NORMAL)
  @ApiOperation({ summary: 'Create multiple service listings in a single request' })
  @ApiResponse({ status: 201, description: 'Listings created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  createBulk(@Body() bulkCreateServiceListingDto: BulkCreateServiceListingDto, @Request() req) {
    return this.serviceListingService.createBulk(bulkCreateServiceListingDto.listings, req.user.id);
  }

  @Get()
  @RateLimit(RateLimits.NORMAL)
  @ApiOperation({ summary: 'Search and list service listings' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 20 })
  @ApiQuery({ name: 'keyword', required: false, description: 'Search by title or description' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category', enum: ['technical', 'business', 'design', 'marketing', 'career', 'language', 'other'] })
  @ApiQuery({ name: 'currency', required: false, description: 'Filter by currency code', example: 'USD' })
  @ApiQuery({ name: 'minPrice', required: false, description: 'Minimum price', example: 10 })
  @ApiQuery({ name: 'maxPrice', required: false, description: 'Maximum price', example: 500 })
  @ApiQuery({ name: 'minDuration', required: false, description: 'Minimum duration in hours', example: 1 })
  @ApiQuery({ name: 'maxDuration', required: false, description: 'Maximum duration in hours', example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated list of service listings' })
  findAll(@Query() query: ServiceListingQueryDto) {
    return this.serviceListingService.findAll(query);
  }

  @Get(':id')
  @RateLimit(RateLimits.NORMAL)
  @ApiOperation({ summary: 'Get service listing by ID' })
  @ApiResponse({ status: 200, description: 'Service listing found' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  findOne(@Param('id') id: string) {
    return this.serviceListingService.findOne(id);
  }

  @Get(':id/with-reviews')
  @RateLimit(RateLimits.NORMAL)
  @ApiOperation({ summary: 'Get service listing with reviews' })
  @ApiResponse({ status: 200, description: 'Service listing with reviews found' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  findOneWithReviews(@Param('id') id: string) {
    return this.serviceListingService.findOneWithReviews(id);
  }

  @Get('slug/:slug')
  @RateLimit(RateLimits.NORMAL)
  @ApiOperation({ summary: 'Get service listing by slug' })
  @ApiResponse({ status: 200, description: 'Service listing found' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  findBySlug(@Param('slug') slug: string) {
    return this.serviceListingService.findBySlug(slug);
  }

  @Post(':id/view')
  @RateLimit(RateLimits.NORMAL)
  @ApiOperation({ summary: 'Track view for a service listing' })
  @ApiResponse({ status: 200, description: 'View count incremented' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  trackView(@Param('id') id: string) {
    return this.serviceListingService.incrementViewCount(id);
  }

  @Post(':id/click')
  @RateLimit(RateLimits.NORMAL)
  @ApiOperation({ summary: 'Track click for a service listing' })
  @ApiResponse({ status: 200, description: 'Click count incremented' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  trackClick(@Param('id') id: string) {
    return this.serviceListingService.incrementClickCount(id);
  }

  @Patch(':id')
  @RateLimit(RateLimits.NORMAL)
  @UseGuards(ListingOwnershipGuard)
  @ApiOperation({ summary: 'Update service listing' })
  @ApiResponse({ status: 200, description: 'Service listing updated successfully' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  update(@Param('id') id: string, @Body() updateServiceListingDto: UpdateServiceListingDto, @Request() req) {
    return this.serviceListingService.update(id, updateServiceListingDto, req.user.id);
  }

  @Patch(':id/featured')
  @RateLimit(RateLimits.NORMAL)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Toggle featured status for a service listing (Admin only)' })
  @ApiResponse({ status: 200, description: 'Featured status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  toggleFeatured(@Param('id') id: string, @Body() toggleFeaturedDto: ToggleFeaturedDto) {
    return this.serviceListingService.toggleFeatured(id, toggleFeaturedDto.isFeatured);
  }

  @Patch(':id/visibility')
  @RateLimit(RateLimits.NORMAL)
  @Roles(UserRole.MENTOR)
  @UseGuards(ListingOwnershipGuard)
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

  @Patch(':id/draft')
  @RateLimit(RateLimits.NORMAL)
  @Roles(UserRole.MENTOR)
  @UseGuards(ListingOwnershipGuard)
  @ApiOperation({ summary: 'Toggle draft mode for a service listing' })
  @ApiResponse({ status: 200, description: 'Draft status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Mentor access required' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  toggleDraft(
    @Param('id') id: string,
    @Body() toggleDraftDto: ToggleDraftDto,
    @Request() req,
  ) {
    return this.serviceListingService.toggleDraft(id, toggleDraftDto.isDraft, req.user.id);
  }

  @Delete(':id')
  @RateLimit(RateLimits.NORMAL)
  @Roles(UserRole.MENTOR)
  @UseGuards(ListingOwnershipGuard)
  @ApiOperation({ summary: 'Soft delete a service listing (owner only)' })
  @ApiResponse({ status: 200, description: 'Service listing deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - you can only delete your own listings' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  remove(@Param('id') id: string, @Request() req) {
    return this.serviceListingService.remove(id, req.user.id);
  }

  @Post(':id/upload-image')
  @RateLimit(RateLimits.NORMAL)
  @Roles(UserRole.MENTOR)
  @UseGuards(ListingOwnershipGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload image for a service listing' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ 
    status: 200, 
    description: 'Listing image uploaded successfully',
    type: UploadListingImageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file or upload failed' })
  @ApiResponse({ status: 403, description: 'Forbidden - Mentor access required' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  async uploadListingImage(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|gif|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Request() req,
  ) {
    try {
      // Verify ownership
      const listing = await this.serviceListingService.findOne(id);
      if (!listing) {
        throw new BadRequestException('Service listing not found');
      }
      if (listing.mentorId !== req.user.id) {
        throw new BadRequestException('You can only upload images for your own listings');
      }

      // Upload image and update listing
      const imageUrl = await this.serviceListingService.uploadImage(id, file);
      
      return {
        message: 'Listing image uploaded successfully',
        imageUrl: this.serviceListingService.getFileUrl(imageUrl),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to upload listing image');
    }
  }

  // ==================== Admin Endpoints ====================

  @Post(':id/approve')
  @RateLimit(RateLimits.NORMAL)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve or reject a service listing (Admin only)' })
  @ApiResponse({ status: 200, description: 'Listing approval status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  approveListing(
    @Param('id') id: string,
    @Body() approveListingDto: ApproveListingDto,
    @Request() req,
  ) {
    return this.serviceListingService.approveListing(
      id,
      approveListingDto.status,
      approveListingDto.rejectionReason,
      req.user.id,
    );
  }

  @Get('admin/pending')
  @RateLimit(RateLimits.NORMAL)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all pending listings (Admin only)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 20 })
  @ApiQuery({ name: 'keyword', required: false, description: 'Search by title or description' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiResponse({ status: 200, description: 'Paginated list of pending listings' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  findPendingListings(@Query() query: ServiceListingQueryDto) {
    return this.serviceListingService.findPendingListings(query);
  }

  @Get('admin/all')
  @RateLimit(RateLimits.NORMAL)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all listings for admin management' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 20 })
  @ApiQuery({ name: 'keyword', required: false, description: 'Search by title or description' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'approvalStatus', required: false, description: 'Filter by approval status', enum: ['pending', 'approved', 'rejected'] })
  @ApiResponse({ status: 200, description: 'Paginated list of all listings' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  findAllForAdmin(@Query() query: ServiceListingQueryDto) {
    return this.serviceListingService.findAllForAdmin(query);
  }

  @Get(':id/analytics')
  @RateLimit(RateLimits.NORMAL)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get analytics for a service listing (Admin only)' })
  @ApiResponse({ status: 200, description: 'Listing analytics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 404, description: 'Service listing not found' })
  getListingAnalytics(@Param('id') id: string) {
    return this.serviceListingService.getListingAnalytics(id);
  }
}
