import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimezoneModule } from '../common/timezone/timezone.module';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AvailabilityException } from './entities/availability-exception.entity';
import { AvailabilitySlot } from './entities/availability-slot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AvailabilitySlot, AvailabilityException]), TimezoneModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
