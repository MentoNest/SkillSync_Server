import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Notification } from '../entities/notification.entity.js';
import { NotificationPreference } from '../entities/notification-preference.entity.js';
import { NotificationService } from '../services/notification.service.js';
import { NotificationController } from '../controllers/notification.controller.js';
import { RedisService } from '../services/redis.service.js';
import { getJwtSecret } from '../config/production-security.config.js';

/**
 * #1364: notification system — REST API plus the `/notifications` WebSocket
 * namespace. The gateway lives on NotificationService so any module importing
 * this one can emit real-time notifications through it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationPreference]),
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, RedisService],
  exports: [NotificationService],
})
export class NotificationModule {}
