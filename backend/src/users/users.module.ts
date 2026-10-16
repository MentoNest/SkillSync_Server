import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorProfile } from './entities/mentor-profile.entity';
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, MentorProfile])],
  exports: [TypeOrmModule],
})
export class UsersModule {}
