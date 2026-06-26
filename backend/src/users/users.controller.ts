import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { SearchUsersDto } from './dto/search-users.dto';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  async searchUsers(@Query() query: SearchUsersDto) {
    return this.usersService.searchUsers({
      role: query.role,
      search: query.search,
      skill: query.skill,
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }
}
