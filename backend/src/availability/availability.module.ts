import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MentorProfile } from '../profile/mentor-profile.entity';
import { User } from '../user/user.entity';
import { AvailabilityController } from './availability.controller';
import { AvailabilityException } from './availability-exception.entity';
import { AvailabilitySlot } from './availability-slot.entity';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AvailabilitySlot,
      AvailabilityException,
      MentorProfile,
      User,
    ]),
    AuthModule,
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
