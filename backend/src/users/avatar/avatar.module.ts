import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';
import { LocalStorageService, S3StorageService, StorageService } from './storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AvatarController],
  providers: [
    AvatarService,
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageService =>
        (config.get<string>('STORAGE_DRIVER') ?? 'local') === 's3'
          ? new S3StorageService(config)
          : new LocalStorageService(config),
    },
  ],
  exports: [AvatarService],
})
export class AvatarModule {}
