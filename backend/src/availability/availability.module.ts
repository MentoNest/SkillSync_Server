import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilitySlot } from './entities/availability-slot.entity.js';
import { AvailabilityException } from './entities/availability-exception.entity.js';
import { AvailabilityService } from './availability.service.js';
import { AvailabilityController } from './availability.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([AvailabilitySlot, AvailabilityException])],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
