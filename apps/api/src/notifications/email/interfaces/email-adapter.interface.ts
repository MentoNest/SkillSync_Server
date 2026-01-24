/**
 * Email notification payload
 */
export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}

/**
 * Abstract email adapter interface
 * Implementations must provide a send method
 * This allows switching between different email providers
 */
export interface IEmailAdapter {
  /**
   * Send an email
   * @param payload - Email payload
   * @returns Promise with send result
   */
  send(payload: EmailPayload): Promise<{ success: boolean; messageId?: string }>;

  /**
   * Check if adapter is configured and ready
   * @returns True if adapter is ready to send emails
   */
  isConfigured(): boolean;
}
