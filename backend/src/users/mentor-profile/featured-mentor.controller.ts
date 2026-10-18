import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '../../rate-limit/throttle.decorator';
import { Public } from '../../auth/guards/jwt-auth.guard';
import { ApiPaginationQuery } from '../../common/pagination/swagger-pagination.decorators';
import { FeaturedMentorQueryDto } from './dto/featured-mentor.dto';
import { FeaturedMentorService } from './featured-mentor.service';

/** Public homepage/discovery listing of featured mentors (#1459). */
@ApiTags('mentors')
@Controller('mentors')
export class FeaturedMentorController {
  constructor(private readonly featured: FeaturedMentorService) {}

  @Public()
  @Get('featured')
  @Throttle(60, 60)
  @ApiPaginationQuery()
  @ApiOperation({ summary: 'List featured mentors, newest promotion first within a manual order' })
  listFeatured(@Query() query: FeaturedMentorQueryDto) {
    return this.featured.listFeatured(query);
  }
}