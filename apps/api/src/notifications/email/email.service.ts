import { Injectable, Logger } from '@nestjs/common';
import { EmailAdapter } from './adapters/email.adapter';
import { SendEmailPayload } from './email.types';
import { EmailLogger } from './email.logger';

import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly adapter: EmailAdapter) {}

  async sendEmail(payload: SendEmailPayload) {
    const html = this.renderTemplate(payload.template, payload.data);

    const result = await this.adapter.send({
      ...payload,
      data: { html },
    });

    if (!result.success) {
      this.logger.error(
        `Email failed → ${payload.to}`,
        result.error,
      );
    } else {
      this.logger.log(
        `Email sent → ${payload.to} (${result.provider})`,
      );
    }

    return result;
  }

  private renderTemplate(templateName: string, data: Record<string, any>) {
    const templatePath = path.join(
      __dirname,
      'templates',
      `${templateName}.hbs`,
    );

    const source = fs.readFileSync(templatePath, 'utf-8');
    const template = Handlebars.compile(source);

    return template(data);
  }

  async sendEmail(payload: SendEmailPayload) {
  EmailLogger.logSendAttempt(payload);
  EmailLogger.logTemplateRender(payload.template);

  const html = this.renderTemplate(payload.template, payload.data);

  const result = await this.adapter.send({
    ...payload,
    data: { html },
  });

  if (result.success) {
    EmailLogger.logSuccess(payload, result);
  } else {
    EmailLogger.logFailure(payload, result);
  }

  return result;
}
}
