import { Module } from '@nestjs/common';
import { NotificationService } from './providers/notification.service';
import { NotificationController } from './notification.controller';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
