import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenteeProfile } from './entities/mentee-profile.entity';
import { MentorProfile } from './entities/mentor-profile.entity';
import { User } from './entities/user.entity';
import { ProfileHistory } from './profile-history/entities/profile-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, MentorProfile, MenteeProfile])],
  exports: [TypeOrmModule],
})
export class UsersModule {}
