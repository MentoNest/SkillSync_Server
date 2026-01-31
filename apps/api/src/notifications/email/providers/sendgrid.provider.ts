import { EmailAdapter } from "../adapters/email.adapter";

export class SendGridEmailProvider implements EmailAdapter {
  async send({ to, subject, html }: any): Promise<void> {
    // sendgrid.send({ to, subject, html })
  }
}
