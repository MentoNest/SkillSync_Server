import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseBackup } from './entities/database-backup.entity';
import { DatabaseBackupService } from './database-backup.service';
import { DatabaseBackupController } from './database-backup.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DatabaseBackup])],
  controllers: [DatabaseBackupController],
  providers: [DatabaseBackupService],
  exports: [DatabaseBackupService],
})
export class DatabaseBackupModule {}
