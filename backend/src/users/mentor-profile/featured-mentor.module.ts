import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';
import { AdminFeaturedMentorController } from './admin-featured-mentor.controller';
import { FeaturedMentorController } from './featured-mentor.controller';
import { FeaturedMentorService } from './featured-mentor.service';

/** Featured-mentor spotlight: public listing plus admin controls (#1459). */
@Module({
  imports: [TypeOrmModule.forFeature([MentorProfile, User]), AuditModule],
  controllers: [FeaturedMentorController, AdminFeaturedMentorController],
  providers: [FeaturedMentorService],
  exports: [FeaturedMentorService],
})
export class FeaturedMentorModule {}