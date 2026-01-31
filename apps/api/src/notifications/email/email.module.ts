import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailTemplateService } from './templates/template.service';
import { EmailAdapter } from "./adapters/email.adapter",
import { MockEmailProvider } from './providers/mock.provider';
import { SendGridEmailProvider } from './providers/sendgrid.provider';

@Module({
  providers: [
    EmailService,
    EmailTemplateService,
    {
      provide: EmailAdapter,
      useFactory: () => {
        switch (process.env.EMAIL_PROVIDER) {
          case 'sendgrid':
            return new SendGridEmailProvider();
          default:
            return new MockEmailProvider();
        }
      },
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
