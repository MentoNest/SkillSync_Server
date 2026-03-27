import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsService } from './providers/bookings.service';
import { BookingsController } from './bookings.controller';
import { Booking } from './entities/booking.entity';
import { ServiceListing } from '../service-listing/entities/service-listing.entity';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Booking, ServiceListing]),
  ],
  controllers: [BookingsController],
  providers: [BookingsService, RolesGuard],
  exports: [BookingsService],
})
export class BookingsModule {}
