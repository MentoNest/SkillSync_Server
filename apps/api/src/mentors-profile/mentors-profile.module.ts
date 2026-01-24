import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorProfile } from './entities/mentors-profile.entity';
import { AdminMentorsController } from './admin-mentor.controller';
import { MentorsController } from './mentors-profile.controller';
import { MentorsService } from './mentors-profile.service';

@Module({
  imports: [TypeOrmModule.forFeature([MentorProfile])],
  controllers: [MentorsController, AdminMentorsController],
  providers: [MentorsService],
  exports: [MentorsService],
})
export class MentorsModule {}
