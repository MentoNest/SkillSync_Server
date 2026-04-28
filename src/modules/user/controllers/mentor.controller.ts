import {
  Controller,
  Get,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { MentorService } from '../services/mentor.service';
import { FeaturedMentorsPageDto } from '../dto/featured-mentor.dto';

@ApiTags('Mentors')
@Controller('mentors')
export class MentorController {
  constructor(private readonly mentorService: MentorService) {}

  @Get('featured')
  @ApiOperation({ summary: 'Get featured mentors with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'List of featured mentors',
    type: FeaturedMentorsPageDto,
  })
  async getFeaturedMentors(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<FeaturedMentorsPageDto> {
    return this.mentorService.getFeaturedMentors(page, limit);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search mentors with featured priority' })
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'prioritizeFeatured',
    required: false,
    type: Boolean,
    example: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Search results with featured mentors prioritized',
    type: FeaturedMentorsPageDto,
  })
  async searchMentors(
    @Query('q') query: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('prioritizeFeatured', new DefaultValuePipe(true), ParseIntPipe)
    prioritizeFeatured: boolean,
  ): Promise<FeaturedMentorsPageDto> {
    return this.mentorService.searchMentors(query, page, limit, prioritizeFeatured === 1);
  }
}
