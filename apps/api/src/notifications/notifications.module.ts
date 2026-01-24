import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailNotificationService } from './email/services/email-notification.service';
import { TemplateRendererService } from './email/services/template-renderer.service';
import { MockEmailAdapter } from './email/adapters/mock-email.adapter';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'EMAIL_ADAPTER',
      useClass: MockEmailAdapter,
    },
    EmailNotificationService,
    TemplateRendererService,
  ],
  exports: [EmailNotificationService, 'EMAIL_ADAPTER'],
})
export class NotificationsModule {}
