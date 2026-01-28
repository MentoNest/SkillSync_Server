import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './services/email.service';
import { TemplateService } from './services/template.service';
import { Notification } from './entities/notification.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationController } from './controllers/notification.controller';
import { NotificationService } from './services/notification.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), ConfigModule],
  controllers: [NotificationController],
  providers: [EmailService, TemplateService, NotificationService],
  exports: [EmailService, NotificationService],
})
export class NotificationsModule {}
