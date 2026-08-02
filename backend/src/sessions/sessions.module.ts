import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionsService } from './sessions.service.js';
import { SessionsController } from './sessions.controller.js';
import { Session } from './entities/session.entity.js';
import { AvailabilityModule } from '../availability/availability.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session]),
    AvailabilityModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
