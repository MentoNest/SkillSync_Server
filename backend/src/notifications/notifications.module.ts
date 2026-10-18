import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationBus } from './notification-bus';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationPreference])],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationBus],
  exports: [NotificationsService, NotificationBus],
})
export class NotificationsModule {}
