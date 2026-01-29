import { SendEmailPayload, EmailSendResult } from '../email.types';

export interface EmailAdapter {
  send(payload: SendEmailPayload): Promise<EmailSendResult>;
}
