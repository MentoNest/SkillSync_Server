import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { RoleName } from '../../rbac/roles';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { ProfileHistoryQueryDto } from './dto/profile-history-query.dto';
import { ProfileHistoryService } from './profile-history.service';

@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles(RoleName.ADMIN)
export class ProfileHistoryController {
  constructor(private readonly history: ProfileHistoryService) {}

  @Get(':userId/profile-history')
  list(@Param('userId', ParseUUIDPipe) userId: string, @Query() query: ProfileHistoryQueryDto) {
    return this.history.listForUser(userId, query.page, query.limit);
  }
}
