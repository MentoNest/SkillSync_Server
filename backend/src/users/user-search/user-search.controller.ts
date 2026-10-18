import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../auth/guards/jwt-auth.guard';
import { Throttle } from '../../rate-limit/throttle.decorator';
import { UserSearchQueryDto } from './dto/user-search-query.dto';
import { UserSearchService } from './user-search.service';

@Controller('users')
export class UserSearchController {
  constructor(private readonly search: UserSearchService) {}

  @Public()
  @Get()
  @Throttle(60, 60)
  find(@Query() query: UserSearchQueryDto) {
    return this.search.search(query);
  }
}
