import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BookmarksService } from './providers/bookmarks.service';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { UpdateBookmarkDto } from './dto/update-bookmark.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('bookmarks')
@Controller('bookmarks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Post(':listingId')
  @ApiOperation({ summary: 'Bookmark a listing' })
  @ApiResponse({ status: 201, description: 'Listing bookmarked successfully' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  @ApiResponse({ status: 409, description: 'Listing already bookmarked' })
  async create(
    @Param('listingId') listingId: string,
    @Body() createBookmarkDto: CreateBookmarkDto,
    @Request() req,
  ) {
    return this.bookmarksService.create(createBookmarkDto, req.user.id, listingId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all saved bookmarks for current user' })
  @ApiResponse({ status: 200, description: 'List of user bookmarks' })
  async findAll(@Request() req) {
    return this.bookmarksService.findAllByUserId(req.user.id);
  }

  @Get('count')
  @ApiOperation({ summary: 'Get bookmark count for current user' })
  @ApiResponse({ status: 200, description: 'Number of bookmarks' })
  async getCount(@Request() req) {
    const count = await this.bookmarksService.getCount(req.user.id);
    return { count };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific bookmark by ID' })
  @ApiResponse({ status: 200, description: 'Bookmark details' })
  @ApiResponse({ status: 404, description: 'Bookmark not found' })
  async findOne(@Param('id') id: string, @Request() req) {
    return this.bookmarksService.findOne(id, req.user.id);
  }

  @Get('check/:listingId')
  @ApiOperation({ summary: 'Check if a listing is bookmarked' })
  @ApiResponse({ status: 200, description: 'Bookmark status' })
  async isBookmarked(@Param('listingId') listingId: string, @Request() req) {
    const isBookmarked = await this.bookmarksService.isBookmarked(req.user.id, listingId);
    return { isBookmarked };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update bookmark notes' })
  @ApiResponse({ status: 200, description: 'Bookmark updated successfully' })
  @ApiResponse({ status: 404, description: 'Bookmark not found' })
  async update(
    @Param('id') id: string,
    @Body() updateBookmarkDto: UpdateBookmarkDto,
    @Request() req,
  ) {
    return this.bookmarksService.update(id, updateBookmarkDto, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a bookmark by ID' })
  @ApiResponse({ status: 204, description: 'Bookmark removed successfully' })
  @ApiResponse({ status: 404, description: 'Bookmark not found' })
  async remove(@Param('id') id: string, @Request() req) {
    await this.bookmarksService.remove(id, req.user.id);
  }

  @Delete('listing/:listingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove bookmark by listing ID' })
  @ApiResponse({ status: 204, description: 'Bookmark removed successfully' })
  async removeByListingId(@Param('listingId') listingId: string, @Request() req) {
    await this.bookmarksService.removeByListingId(req.user.id, listingId);
  }
}
