import { Injectable, Logger } from '@nestjs/common';
import { SendEmailInput } from './email.types';
import { EmailTemplateService } from './templates/template.service';
import { EmailAdapter } from './adapters/email.adapter';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly adapter: EmailAdapter,
    private readonly templates: EmailTemplateService,
  ) {}

  async sendEmail(input: SendEmailInput): Promise<void> {
    try {
      const html = this.templates.render(
        input.template,
        input.data,
      );

      await this.adapter.send({
        to: input.to,
        subject: input.subject,
        html,
      });

      this.logger.log(`Email sent to ${input.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${input.to}`,
        error.stack,
      );
      throw error;
    }
  }
}
