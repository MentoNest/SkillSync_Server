import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('mentors')
export class MentorsController {
  constructor(private readonly usersService: UsersService) {}

  @Get('featured')
  async getFeaturedMentors(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) || 1 : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10) || 10, 50) : 10;
    return this.usersService.getFeaturedMentors(pageNum, limitNum);
  }
}
