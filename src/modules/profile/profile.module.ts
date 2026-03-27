import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ProfileService } from './providers/profile.service';
import { ProfileController } from './profile.controller';
import { MentorProfileService } from './providers/mentor-profile.service';
import { MenteeProfileService } from './providers/mentee-profile.service';
import { FileUploadService } from './providers/file-upload.service';
import { ProfileHistoryService } from './providers/profile-history.service';
import { MentorProfileController } from './mentor-profile.controller';
import { MenteeProfileController } from './mentee-profile.controller';
import { FileUploadController } from './file-upload.controller';
import { ProfileHistoryController } from './profile-history.controller';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { ListingsModule } from '../listings/listings.module';
import { UserService } from '../user/providers/user.service';
import { MentorSkillsModule } from '../mentor_skills/mentor-skills.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MentorProfile } from './entities/mentor-profile.entity';
import { MenteeProfile } from './entities/mentee-profile.entity';
import { ProfileHistory } from './entities/profile-history.entity';
import { User } from '../user/entities/user.entity';
import { Wallet } from '../user/entities/wallet.entity';

@Module({
  imports: [
    AuthModule,
    UserModule,
    TypeOrmModule.forFeature([MentorProfile, MenteeProfile, ProfileHistory, User, Wallet]),
    MulterModule.register({
      dest: './uploads',
    }),
    MentorSkillsModule,
  ],
  controllers: [
    ProfileController,
    MentorProfileController,
    MenteeProfileController,
    FileUploadController,
    ProfileHistoryController,
  ],
  providers: [
    ProfileService,
    MentorProfileService,
    MenteeProfileService,
    FileUploadService,
    ProfileHistoryService,
    UserService,
    RolesGuard,
  ],
})
export class ProfileModule {}
