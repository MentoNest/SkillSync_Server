import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';
import { Notification } from './entities/notification.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), ConfigModule],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
