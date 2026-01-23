export interface IMailer {
  send(to: string, subject: string, html: string): Promise<void>;
}
