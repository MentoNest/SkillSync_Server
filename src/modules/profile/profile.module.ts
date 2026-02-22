import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ProfileService } from './providers/profile.service';
import { ProfileController } from './profile.controller';
import { MentorProfileService } from './providers/mentor-profile.service';
import { MenteeProfileService } from './providers/mentee-profile.service';
import { FileUploadService } from './providers/file-upload.service';
import { MentorProfileController } from './mentor-profile.controller';
import { MenteeProfileController } from './mentee-profile.controller';
import { FileUploadController } from './file-upload.controller';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MentorProfile } from './entities/mentor-profile.entity';
import { MenteeProfile } from './entities/mentee-profile.entity';

@Module({
  imports: [
    AuthModule,
    UserModule,
    TypeOrmModule.forFeature([MentorProfile, MenteeProfile]),
    MulterModule.register({
      dest: './uploads',
    }),
  ],
  controllers: [
    ProfileController,
    MentorProfileController,
    MenteeProfileController,
    FileUploadController,
  ],
  providers: [
    ProfileService,
    MentorProfileService,
    MenteeProfileService,
    FileUploadService,
    RolesGuard,
  ],
})
export class ProfileModule {}
