import { Body, Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import { RoleName } from '../../rbac/roles';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { ChangeStatusDto } from './dto/change-status.dto';
import { UserStatusService } from './user-status.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(RoleName.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/users')
export class UserStatusController {
  constructor(private readonly statuses: UserStatusService) {}

  @Patch(':userId/status')
  change(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.statuses.changeStatus(userId, dto.status, actorId);
  }
}
