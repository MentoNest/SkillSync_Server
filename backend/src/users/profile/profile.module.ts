import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenteeProfile } from '../entities/mentee-profile.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { PublicProfileController } from './public-profile.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, MentorProfile, MenteeProfile])],
  controllers: [ProfileController, PublicProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
