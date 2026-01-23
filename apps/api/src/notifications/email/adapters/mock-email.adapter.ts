import { Injectable, Logger } from '@nestjs/common';
import { IEmailAdapter, EmailPayload } from '../interfaces/email-adapter.interface';

/**
 * Mock email adapter for development and testing
 * Logs email sending to console without actually sending
 * Useful for development and unit testing
 */
@Injectable()
export class MockEmailAdapter implements IEmailAdapter {
  private readonly logger = new Logger(MockEmailAdapter.name);
  private sentEmails: EmailPayload[] = [];

  /**
   * Mock send - logs the email and stores in memory
   */
  async send(payload: EmailPayload): Promise<{ success: boolean; messageId: string }> {
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    this.logger.log(
      `[MOCK EMAIL] To: ${payload.to}, Subject: ${payload.subject}, MessageId: ${messageId}`,
    );

    // Store for testing
    this.sentEmails.push(payload);

    return { success: true, messageId };
  }

  /**
   * Mock adapter is always configured
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Get all sent emails (for testing)
   */
  getSentEmails(): EmailPayload[] {
    return [...this.sentEmails];
  }

  /**
   * Clear sent emails (for testing)
   */
  clearSentEmails(): void {
    this.sentEmails = [];
  }

  /**
   * Get last sent email (for testing)
   */
  getLastEmail(): EmailPayload | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  /**
   * Find email by recipient (for testing)
   */
  findEmailByRecipient(email: string): EmailPayload | undefined {
    return this.sentEmails.find((e) => e.to === email);
  }
}
