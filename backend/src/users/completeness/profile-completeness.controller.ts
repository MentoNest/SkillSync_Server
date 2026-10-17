import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import { RoleName } from '../../rbac/roles';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { ProfileCompletenessService } from './profile-completeness.service';

@ApiTags('User')
@ApiBearerAuth()
@Controller('user/profile')
export class CompletenessController {
  constructor(private readonly completeness: ProfileCompletenessService) {}

  @Get('completeness')
  get(@CurrentUser('sub') userId: string) {
    return this.completeness.compute(userId);
  }
}

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(RoleName.ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/users')
export class AdminCompletenessController {
  constructor(private readonly completeness: ProfileCompletenessService) {}

  @Get('completeness')
  list() {
    return this.completeness.computeForAllUsers();
  }
}
