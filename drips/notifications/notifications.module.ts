import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './services/email.service';
import { TemplateService } from './services/template.service';

@Module({
  imports: [ConfigModule],
  providers: [EmailService, TemplateService],
  exports: [EmailService],
})
export class NotificationsModule {}
