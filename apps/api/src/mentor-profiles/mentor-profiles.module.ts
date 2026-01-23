import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorProfile } from './entities/mentor-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MentorProfile])],
  exports: [TypeOrmModule],
})
export class MentorProfilesModule {}
