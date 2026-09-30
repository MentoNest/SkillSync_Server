import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './session.entity.js';
import { SessionService } from './session.service.js';
import { SessionController } from './session.controller.js';
import { User } from '../user/entities/user.entity.js';
import { AvailabilitySlot } from '../entities/availability-slot.entity.js';
import { NotificationModule } from '../modules/notification.module.js';

/**
 * #1363: session scheduling. NotificationModule is imported (not forwarded)
 * so SessionService can fan lifecycle events and reminders out through the
 * shared NotificationService; NotificationModule has no dependency on this
 * module, so no circular import arises.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Session, User, AvailabilitySlot]),
    NotificationModule,
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
