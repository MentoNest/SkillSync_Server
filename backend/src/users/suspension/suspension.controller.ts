import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { RoleName } from '../../rbac/roles';
import { RolesGuard } from '../../rbac/roles.guard';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { SuspensionService } from './suspension.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(RoleName.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/users')
export class SuspensionController {
  constructor(private readonly suspensions: SuspensionService) {}

  @Post(':userId/suspend')
  @HttpCode(200)
  suspend(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.suspensions.suspend(userId, adminId, { reason: dto.reason, days: dto.days ?? null });
  }

  @Post(':userId/unsuspend')
  @HttpCode(200)
  unsuspend(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser('sub') adminId: string) {
    return this.suspensions.unsuspend(userId, adminId);
  }

  @Get('suspended')
  listSuspended() {
    return this.suspensions.listActive();
  }
}
