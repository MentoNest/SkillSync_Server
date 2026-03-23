import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SkillPopularityService } from './providers/skill-popularity.service';
import { PopularityEventType } from './entities/skill-popularity-daily.entity';
import {
  RecordEventDto,
  PopularityQueryDto,
  TrendingQueryDto,
  PopularitySummaryQueryDto,
} from './dto/skill-popularity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Skill Popularity')
@Controller('skills/popularity')
export class SkillPopularityController {
  constructor(private readonly popularityService: SkillPopularityService) {}

  @Post('record')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record a popularity event for a skill' })
  @ApiResponse({ status: 201, description: 'Event recorded successfully' })
  async recordEvent(@Body() dto: RecordEventDto) {
    const eventType = dto.eventType || PopularityEventType.SKILL_PAGE_VIEW;
    await this.popularityService.incrementCounter(dto.skillId, eventType);
    return { success: true, message: 'Event recorded' };
  }

  @Post('record-page-view/:skillId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record a page view for a skill' })
  @ApiResponse({ status: 201, description: 'Page view recorded' })
  async recordPageView(@Param('skillId', ParseIntPipe) skillId: number) {
    await this.popularityService.recordPageView(skillId);
    return { success: true };
  }

  @Post('record-search-click/:skillId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record a search click for a skill' })
  @ApiResponse({ status: 201, description: 'Search click recorded' })
  async recordSearchClick(@Param('skillId', ParseIntPipe) skillId: number) {
    await this.popularityService.recordSearchClick(skillId);
    return { success: true };
  }

  @Get('score/:skillId')
  @ApiOperation({ summary: 'Get popularity score for a specific skill' })
  @ApiResponse({ status: 200, description: 'Popularity score calculated' })
  async getSkillScore(
    @Param('skillId', ParseIntPipe) skillId: number,
    @Query() query: PopularityQueryDto,
  ) {
    return this.popularityService.calculatePopularityScore(
      skillId,
      query.days,
      query.decayFactor,
    );
  }

  @Get('history/:skillId')
  @ApiOperation({ summary: 'Get popularity history for a skill' })
  @ApiResponse({ status: 200, description: 'Popularity history retrieved' })
  async getSkillHistory(
    @Param('skillId', ParseIntPipe) skillId: number,
    @Query('days') days?: number,
  ) {
    return this.popularityService.getSkillPopularity(skillId, days || 30);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get trending skills based on recent activity' })
  @ApiResponse({ status: 200, description: 'Trending skills retrieved' })
  async getTrending(@Query() query: TrendingQueryDto) {
    return this.popularityService.getTrendingSkills(
      query.days,
      query.limit,
      query.decayFactor,
    );
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get popularity summary for all skills (paginated)' })
  @ApiResponse({ status: 200, description: 'Popularity summary retrieved' })
  async getSummary(@Query() query: PopularitySummaryQueryDto) {
    return this.popularityService.getAllPopularitySummary(
      query.days,
      query.page,
      query.limit,
    );
  }
}
