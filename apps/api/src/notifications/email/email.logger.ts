import { Logger } from '@nestjs/common';
import { EmailSendResult, SendEmailPayload } from './email.types';

export class EmailLogger {
  private static readonly logger = new Logger('EmailNotification');

  static logSendAttempt(payload: SendEmailPayload) {
    this.logger.log(
      `Sending email → to=${payload.to} | subject="${payload.subject}" | template=${payload.template}`,
    );
  }

  static logSuccess(
    payload: SendEmailPayload,
    result: EmailSendResult,
  ) {
    this.logger.log(
      `Email sent successfully → to=${payload.to} | provider=${result.provider} | messageId=${result.messageId}`,
    );
  }

  static logFailure(
    payload: SendEmailPayload,
    result: EmailSendResult,
  ) {
    this.logger.error(
      `Email failed → to=${payload.to} | provider=${result.provider}`,
      result.error?.stack || result.error,
    );
  }

  static logTemplateRender(template: string) {
    this.logger.debug(
      `Rendering email template → ${template}`,
    );
  }
}
