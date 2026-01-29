export interface SendEmailPayload {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

export interface EmailSendResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: any;
}
