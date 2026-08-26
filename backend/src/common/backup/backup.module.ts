import { Module, Global } from '@nestjs/common';
import { BackupService } from './backup.service';

@Global()
@Module({
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
