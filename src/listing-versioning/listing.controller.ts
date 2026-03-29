import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { ListingService } from './listing.service';
import { ListingVersionService } from './listing-version.service';
import {
  CreateListingDto,
  UpdateListingDto,
  RevertVersionDto,
  VersionQueryDto,
  CompareVersionsQueryDto,
} from './dto/listing.dto';

/**
 * Minimal auth guard placeholder.
 * Replace with your project's actual JwtAuthGuard.
 */
import { AuthGuard } from '@nestjs/passport';

/**
 * Decorator that extracts the authenticated user from request.
 * Replace with your project's actual @CurrentUser() decorator.
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Listings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('listings')
export class ListingController {
  constructor(
    private readonly listingService: ListingService,
    private readonly versionService: ListingVersionService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new listing (captures version 1)' })
  @ApiResponse({ status: 201, description: 'Listing created.' })
  create(@Body() dto: CreateListingDto, @CurrentUser() user: { id: string }) {
    return this.listingService.create(dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch the current state of a listing' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  findOne(@Param('id') id: string) {
    return this.listingService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a listing (auto-captures a new version)',
  })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 200, description: 'Listing updated; new version captured.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.listingService.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a listing and all its versions' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  remove(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.listingService.remove(id, user.id);
  }

  // ─── Version history ───────────────────────────────────────────────────────

  @Get(':id/versions')
  @ApiOperation({
    summary: 'List all versions of a listing (newest first, paginated)',
  })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'changedBy',
    required: false,
    type: String,
    description: 'Filter by editor user UUID',
  })
  getHistory(@Param('id') id: string, @Query() query: VersionQueryDto) {
    return this.versionService.getHistory(id, query);
  }

  @Get(':id/versions/:versionNumber')
  @ApiOperation({ summary: 'Retrieve a specific version snapshot' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiParam({ name: 'versionNumber', description: 'Sequential version number' })
  getVersion(
    @Param('id') id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
  ) {
    return this.versionService.getVersion(id, versionNumber);
  }

  // ─── Compare ───────────────────────────────────────────────────────────────

  @Get(':id/versions/compare')
  @ApiOperation({
    summary: 'Compare two version snapshots and get field-level diffs',
  })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiQuery({ name: 'v1', type: Number, description: 'First version number' })
  @ApiQuery({ name: 'v2', type: Number, description: 'Second version number' })
  compareVersions(
    @Param('id') id: string,
    @Query() query: CompareVersionsQueryDto,
  ) {
    return this.versionService.compareVersions(id, query);
  }

  // ─── Revert ────────────────────────────────────────────────────────────────

  @Post(':id/versions/:versionNumber/revert')
  @ApiOperation({
    summary:
      'Revert listing to a previous version (creates a new version — history is preserved)',
  })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiParam({ name: 'versionNumber', description: 'Target version to revert to' })
  @ApiResponse({
    status: 201,
    description: 'Revert applied; new version number returned.',
  })
  revert(
    @Param('id') id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @Body() dto: RevertVersionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.listingService.revertToVersion(id, versionNumber, dto, user.id);
  }
}
