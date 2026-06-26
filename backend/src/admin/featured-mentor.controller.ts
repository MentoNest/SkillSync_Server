import { Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard';

@ApiTags('admin')
@Controller()
export class FeaturedMentorController {
  @Post('admin/mentors/:mentorId/feature')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Feature a mentor (admin only)' })
  @ApiResponse({ status: 200, description: 'Mentor featured successfully' })
  async featureMentor(@Param('mentorId') mentorId: string) {
    return { mentorId, isFeatured: true, featuredAt: new Date().toISOString(), message: 'Mentor featured successfully' };
  }

  @Delete('admin/mentors/:mentorId/unfeature')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove featured status from a mentor (admin only)' })
  @ApiResponse({ status: 200, description: 'Mentor unfeatured' })
  async unfeatureMentor(@Param('mentorId') mentorId: string) {
    return { mentorId, isFeatured: false, message: 'Mentor unfeatured successfully' };
  }

  @Get('mentors/featured')
  @ApiOperation({ summary: 'Get paginated featured mentors' })
  @ApiResponse({ status: 200, description: 'List of featured mentors' })
  async getFeaturedMentors(@Query('page') page = 1, @Query('limit') limit = 10) {
    return { data: [], page: Number(page), limit: Number(limit), total: 0 };
  }
}
