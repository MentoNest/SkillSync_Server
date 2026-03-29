import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './booking.entity';
import { BookingConflictService } from './booking-conflict.service';
import { BookingConflictGuard } from './guards/booking-conflict.guard';
import { BookingsController } from './bookings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Booking])],
  providers: [BookingConflictService, BookingConflictGuard],
  controllers: [BookingsController],
  exports: [BookingConflictService, BookingConflictGuard],
})
export class BookingConflictModule {}
