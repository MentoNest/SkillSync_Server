import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsService } from './bookings.service';
<<<<<<< HEAD
import { BookingLifecycleOrchestrator } from './booking-lifecycle.orchestrator';
import { Booking } from './entities/booking.entity';
import { SessionsModule } from '../sessions/sessions.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Booking]), SessionsModule, NotificationsModule],
  providers: [BookingsService, BookingLifecycleOrchestrator],
  exports: [
    BookingsService,
    BookingLifecycleOrchestrator,
    TypeOrmModule,
    SessionsModule,
  ],
=======
import { BookingsController } from './bookings.controller';
import { Booking } from './entities/booking.entity';
import { MentorProfile } from '../mentor-profiles/entities/mentor-profile.entity';
import { User } from '../users/entities/user.entity';
import { AvailabilitySlot } from '../availability/entities/availability-slot.entity';
import { AvailabilityException } from '../availability/availability-exception.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      MentorProfile,
      User,
      AvailabilitySlot,
      AvailabilityException,
    ]),
    NotificationsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
>>>>>>> upstream/main
})
export class BookingsModule {}
