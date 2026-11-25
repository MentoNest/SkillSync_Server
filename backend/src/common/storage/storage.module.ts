import { Module } from '@nestjs/common';
import { AvatarStorageService } from './avatar-storage.service';
import { LocalStorageService } from './storage.service';

@Module({
  providers: [LocalStorageService, AvatarStorageService],
  exports: [LocalStorageService, AvatarStorageService],
})
export class StorageModule {}
