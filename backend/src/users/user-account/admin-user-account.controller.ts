import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RoleName } from '../../rbac/roles';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { ListDeletedQueryDto } from './dto/list-deleted-query.dto';
import { UserAccountService } from './user-account.service';

/** Admin view / recovery of soft-deleted accounts. */
@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles(RoleName.ADMIN)
export class AdminUserAccountController {
  constructor(private readonly accounts: UserAccountService) {}

  @Get('deleted')
  listDeleted(@Query() query: ListDeletedQueryDto) {
    return this.accounts.listDeleted(query.page, query.limit);
  }

  @Post(':userId/restore')
  @HttpCode(200)
  restore(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.accounts.restore(userId);
  }

  @Delete(':userId/purge')
  purge(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.accounts.purge(userId);
  }
}
