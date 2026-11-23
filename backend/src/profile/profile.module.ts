import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProfileHistoryModule } from '../profile-history/profile-history.module';
import { ProfileCompletenessModule } from './profile-completeness.module';
import {
  FeaturedMentorAdminController,
  FeaturedMentorPublicController,
} from './featured-mentor.controller';
import { FeaturedMentorService } from './featured-mentor.service';
import { MenteeProfile } from './mentee-profile.entity';
import { MentorProfile } from './mentor-profile.entity';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import {
  MentorVerificationAdminController,
  MentorVerificationRequestController,
} from './mentor-verification.controller';
import { MentorVerificationService } from './mentor-verification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MentorProfile, MenteeProfile]),
    AuthModule,
    ProfileHistoryModule,
    ProfileCompletenessModule,
  ],
  controllers: [
    ProfileController,
    FeaturedMentorAdminController,
    FeaturedMentorPublicController,
    MentorVerificationAdminController,
    MentorVerificationRequestController,
  ],
  providers: [ProfileService, FeaturedMentorService, MentorVerificationService],
  exports: [ProfileService, FeaturedMentorService, MentorVerificationService],
})
export class ProfileModule {}
