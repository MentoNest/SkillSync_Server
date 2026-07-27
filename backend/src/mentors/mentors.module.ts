import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorProfile } from '../users/entities/mentor-profile.entity.js';
import { MentorFeatureAuditLog } from './entities/mentor-feature-audit-log.entity.js';
import { MentorsService } from './mentors.service.js';
import { MentorsController } from './mentors.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([MentorProfile, MentorFeatureAuditLog])],
  controllers: [MentorsController],
  providers: [MentorsService],
  exports: [MentorsService],
})
export class MentorsModule {}
