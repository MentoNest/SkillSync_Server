import { Module } from '@nestjs/common';
import { LocalStorageService } from './storage.service';

@Module({
  providers: [LocalStorageService],
  exports: [LocalStorageService],
})
export class StorageModule {}
