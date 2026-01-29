import { EmailAdapter } from './email.adapter';
import { SendEmailPayload, EmailSendResult } from '../email.types';
import { Logger } from '@nestjs/common';

export class MockEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger(MockEmailAdapter.name);

  async send(payload: SendEmailPayload): Promise<EmailSendResult> {
    this.logger.log(
      `[MOCK EMAIL] → ${payload.to} | ${payload.subject}`,
    );

    return {
      success: true,
      provider: 'mock',
      messageId: `mock-${Date.now()}`,
    };
  }
}
