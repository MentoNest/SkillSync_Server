import { Injectable, Logger } from '@nestjs/common';
import { IMailer } from './mailer.interface';

@Injectable()
export class MockMailer implements IMailer {
  private readonly logger = new Logger(MockMailer.name);

  async send(to: string, subject: string, html: string): Promise<void> {
    this.logger.log(`Mock email sent to ${to}: ${subject}`);
    this.logger.debug(`Email content: ${html}`);
    await Promise.resolve(); // To satisfy eslint
  }
}
