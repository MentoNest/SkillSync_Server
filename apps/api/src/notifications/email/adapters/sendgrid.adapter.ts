import { EmailAdapter } from './email.adapter';
import { SendEmailPayload, EmailSendResult } from '../email.types';
import * as SendGrid from '@sendgrid/mail';
import { Logger } from '@nestjs/common';

export class SendGridEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger(SendGridEmailAdapter.name);

  constructor(apiKey: string, private readonly fromEmail: string) {
    SendGrid.setApiKey(apiKey);
  }

  async send(payload: SendEmailPayload): Promise<EmailSendResult> {
    try {
      const [response] = await SendGrid.send({
        to: payload.to,
        from: this.fromEmail,
        subject: payload.subject,
        html: payload.data.html,
      });

      return {
        success: true,
        provider: 'sendgrid',
        messageId: response.headers['x-message-id'],
      };
    } catch (error) {
      this.logger.error('SendGrid email failed', error);
      return {
        success: false,
        provider: 'sendgrid',
        error,
      };
    }
  }
}
