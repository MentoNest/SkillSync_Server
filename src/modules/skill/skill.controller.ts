import { Controller, Get, Query, Param, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SkillService } from './skill.service';

@ApiTags('skills')
@Controller('skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  // -------------------------------------
  // SEARCH
  // -------------------------------------
  @Get('search')
  @ApiOperation({ summary: 'Search skills by text query' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page' })
  @ApiQuery({
    name: 'tags',
    required: false,
    description: 'Filter by tag slugs (comma-separated)',
  })
  async search(
    @Query('q') q: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('tags') tags?: string,
  ) {
    const tagArr = tags
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    return this.skillService.search(
      q,
      Number(page),
      Number(limit),
      tagArr,
    );
  }

  // -------------------------------------
  // 🔥 TRENDING SKILLS (NEW)
  // -------------------------------------
  @Get('trending')
  @ApiOperation({
    summary: 'Get trending skills based on popularity signals',
  })
  @ApiQuery({
    name: 'window',
    required: false,
    description: 'Time window (24h, 7d, 30d)',
    example: '7d',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of results (default: 20, max: 100)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'List of trending skills ordered by score',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          skillId: { type: 'number' },
          name: { type: 'string' },
          slug: { type: 'string' },
          score: { type: 'number' },
          rank: { type: 'number' },
        },
      },
    },
  })
  async getTrending(
    @Query('window') window: '24h' | '7d' | '30d' = '7d',
    @Query('limit') limit = 20,
  ) {
    // ✅ Validate window
    const allowedWindows = ['24h', '7d', '30d'];
    if (window && !allowedWindows.includes(window)) {
      throw new BadRequestException(
        `Invalid window value. Allowed: ${allowedWindows.join(', ')}`,
      );
    }

    const parsedLimit = Math.min(Number(limit) || 20, 100);

    return this.skillService.getTrendingSkills(
      window,
      parsedLimit,
    );
  }

  // -------------------------------------
  // RECOMMENDED SKILLS
  // -------------------------------------
  @Get(':slug/recommended')
  @ApiOperation({
    summary:
      'Get recommended skills based on content similarity and popularity',
  })
  @ApiParam({
    name: 'slug',
    description: 'Skill slug identifier',
    type: String,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum results (default: 10)',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'List of recommended skills ordered by relevance',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          sameCategory: { type: 'boolean' },
          tagOverlapCount: { type: 'number' },
          popularityScore: { type: 'number' },
          recommendationScore: { type: 'number' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  async getRecommended(
    @Param('slug') slug: string,
    @Query('limit') limit?: number,
  ) {
    return this.skillService.getRecommendedSkills(
      slug,
      limit ? Number(limit) : 10,
    );
  }
}