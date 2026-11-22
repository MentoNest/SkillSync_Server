import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilitySlot } from '../availability/availability-slot.entity';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { PortfolioLink } from '../user/portfolio-link.entity';
import { User } from '../user/user.entity';
import {
  CompletenessAdminController,
  ProfileCompletenessController,
} from './profile-completeness.controller';
import { ProfileCompletenessService } from './profile-completeness.service';
import { MenteeProfile } from './mentee-profile.entity';
import { MentorProfile } from './mentor-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      MentorProfile,
      MenteeProfile,
      AvailabilitySlot,
      PortfolioLink,
    ]),
    AuthModule,
    RedisModule,
  ],
  controllers: [ProfileCompletenessController, CompletenessAdminController],
  providers: [ProfileCompletenessService],
  exports: [ProfileCompletenessService],
})
export class ProfileCompletenessModule {}
