import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { FeaturedMentorService } from '../services/featured-mentor.service.js';

/**
 * #1346: Public-facing controller for discovering featured mentors.
 *
 * No auth guard — this endpoint is intentionally unauthenticated so that
 * landing pages and marketing surfaces can call it without a bearer token.
 */
@ApiTags('Mentors')
@Controller('mentors')
export class MentorsController {
  constructor(
    private readonly featuredMentorService: FeaturedMentorService,
  ) {}

  /**
   * GET /mentors/featured
   *
   * Returns a paginated list of currently featured (and not-yet-expired)
   * mentor profiles, ordered by featuredOrder ASC (nulls last), then
   * featuredAt ASC.
   */
  @Get('featured')
  @ApiOperation({
    summary: 'List featured mentors (public) (#1346)',
    description:
      'Returns featured, non-expired mentor profiles. Does not require authentication.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 50)' })
  @ApiResponse({ status: 200, description: 'Paginated featured mentor list' })
  async getFeaturedMentors(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
    const limitNum = limit ? Math.min(50, Math.max(1, parseInt(limit, 10))) : 20;
    return this.featuredMentorService.getFeaturedMentors(pageNum, limitNum);
  }
}
