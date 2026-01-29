import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { MockEmailAdapter } from './adapters/mock.adapter';
import { SendGridEmailAdapter } from './adapters/sendgrid.adapter';

@Module({
  providers: [
    {
      provide: 'EMAIL_ADAPTER',
      useFactory: () => {
        const provider = process.env.EMAIL_PROVIDER;

        if (provider === 'sendgrid') {
          return new SendGridEmailAdapter(
            process.env.SENDGRID_API_KEY!,
            process.env.EMAIL_FROM!,
          );
        }

        return new MockEmailAdapter();
      },
    },
    {
      provide: EmailService,
      useFactory: (adapter) => new EmailService(adapter),
      inject: ['EMAIL_ADAPTER'],
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
