import { Module } from '@nestjs/common';
import { BookingsService } from './providers/bookings.service';
import { BookingsController } from './bookings.controller';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
