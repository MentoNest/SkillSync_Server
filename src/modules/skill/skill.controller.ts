import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SkillService } from './skill.service';

@ApiTags('skills')
@Controller('skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search skills by text query' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page' })
  @ApiQuery({ name: 'tags', required: false, description: 'Filter by tag slugs (comma-separated)' })
  async search(
    @Query('q') q: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('tags') tags?: string,
  ) {
    const tagArr = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    return this.skillService.search(q, Number(page), Number(limit), tagArr);
  }

  @Get(':slug/recommended')
  @ApiOperation({ summary: 'Get recommended skills based on content similarity and popularity' })
  @ApiParam({ name: 'slug', description: 'Skill slug identifier', type: String })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum results (default: 10)', type: Number })
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
    return this.skillService.getRecommendedSkills(slug, limit || 10);
  }
}
