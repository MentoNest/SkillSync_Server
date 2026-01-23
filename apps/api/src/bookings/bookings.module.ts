import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsService } from './bookings.service';
import { BookingLifecycleOrchestrator } from './booking-lifecycle.orchestrator';
import { Booking } from './entities/booking.entity';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Booking]), SessionsModule],
  providers: [BookingsService, BookingLifecycleOrchestrator],
  exports: [
    BookingsService,
    BookingLifecycleOrchestrator,
    TypeOrmModule,
    SessionsModule,
  ],
})
export class BookingsModule {}
