export interface SendEmailInput {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

export interface EmailProvider {
  send(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void>;
}
