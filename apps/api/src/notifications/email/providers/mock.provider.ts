import { EmailAdapter } from '../adapters/email.adapter';
import { Logger } from '@nestjs/common';

export class MockEmailProvider implements EmailAdapter {
  private readonly logger = new Logger(MockEmailProvider.name);

  async send({ to, subject, html }: any): Promise<void> {
    this.logger.log(`[MOCK EMAIL]
      To: ${to}
      Subject: ${subject}
      Body: ${html}
    `);
  }
}
