import { Module } from '@nestjs/common';
import { RolesGuard } from '../rbac/roles.guard';
import { BackupController } from './backup.controller';
import { BackupStatusService } from './backup-status.service';

@Module({
  controllers: [BackupController],
  providers: [BackupStatusService, RolesGuard],
})
export class BackupModule {}
