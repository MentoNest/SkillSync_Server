import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorAvailability } from './entities/mentor-availability.entity';
import { BlockedTime } from './entities/blocked-time.entity';
import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MentorAvailability, BlockedTime])],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  /**
   * Export AvailabilityService so the BookingModule (and any other module)
   * can inject it to:
   *   - call checkSlotAvailable() before confirming a booking
   *   - call getAvailableSlots() with already-booked windows filtered out
   */
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
