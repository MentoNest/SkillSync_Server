import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../rbac/roles';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { BackupStatus, BackupStatusService } from './backup-status.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/backups')
@UseGuards(RolesGuard)
@Roles(RoleName.ADMIN)
export class BackupController {
  constructor(private readonly backups: BackupStatusService) {}

  @Get('status')
  status(): Promise<BackupStatus> {
    return this.backups.getStatus();
  }
}
