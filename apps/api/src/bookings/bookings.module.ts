import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { Booking } from './entities/booking.entity';
import { MentorProfile } from '../mentor-profiles/entities/mentor-profile.entity';
import { User } from '../users/entities/user.entity';
import { AvailabilitySlot } from '../availability/entities/availability-slot.entity';
import { AvailabilityException } from '../availability/availability-exception.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      MentorProfile,
      User,
      AvailabilitySlot,
      AvailabilityException,
    ]),
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
