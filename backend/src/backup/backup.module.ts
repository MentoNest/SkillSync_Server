import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BACKUP_CONFIG, buildBackupConfig } from './backup.config';

/**
 * Admin visibility into the PostgreSQL backup strategy (issue #1714). The
 * scheduled backup tooling writes a status file; this module reads it and
 * exposes it through `GET /admin/backups/status`.
 */
@Module({
  imports: [AuthModule],
  controllers: [BackupController],
  providers: [
    {
      provide: BACKUP_CONFIG,
      useFactory: () => buildBackupConfig((key) => process.env[key]),
    },
    BackupService,
  ],
  exports: [BackupService],
})
export class BackupModule {}
