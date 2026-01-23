import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsController } from './controllers/uploads.controller';
import { UploadsService } from './services/uploads.service';
import { LocalFileStorageAdapter } from './adapters/local-file-storage.adapter';
import { FILE_STORAGE_PORT } from './uploads.constants';
import uploadConfig from './config/upload.config';

// Import your entities
// import { User } from '../entities/user.entity';
// import { MentorProfile } from '../entities/mentor-profile.entity';

@Module({
  imports: [
    ConfigModule.forFeature(uploadConfig),
    // TypeOrmModule.forFeature([User, MentorProfile]), // Uncomment and use actual entities
  ],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: FILE_STORAGE_PORT,
      useClass: LocalFileStorageAdapter,
    },
    // Temporary providers - replace with actual entities
    {
      provide: 'UserRepository',
      useValue: {},
    },
    {
      provide: 'MentorProfileRepository',
      useValue: {},
    },
  ],
  exports: [UploadsService, FILE_STORAGE_PORT],
})
export class UploadsModule {}
