import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmailAdapter, EmailPayload } from '../interfaces/email-adapter.interface';
import { TemplateRendererService } from './template-renderer.service';

/**
 * Booking accepted email payload
 */
export interface BookingAcceptedEmailParams {
  menteeName: string;
  menteeEmail: string;
  mentorName: string;
  skillName: string;
  sessionDateTime: string;
  duration: string;
  sessionLink?: string;
  dashboardLink: string;
}

/**
 * Payment released email payload
 */
export interface PaymentReleasedEmailParams {
  recipientName: string;
  recipientEmail: string;
  amount: string;
  listingName: string;
  transactionId: string;
  transactionDate: string;
  bankAccount?: string;
  referenceNumber?: string;
  dashboardLink: string;
}

/**
 * Email notification service
 * Handles sending emails through a pluggable adapter
 * Supports multiple email types with template rendering
 */
@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);
  private emailProvider: string;
  private appUrl: string;

  constructor(
    @Inject('EMAIL_ADAPTER')
    private readonly emailAdapter: IEmailAdapter,
    private readonly templateRenderer: TemplateRendererService,
    private readonly configService: ConfigService,
  ) {
    this.emailProvider = this.configService.get<string>('EMAIL_PROVIDER', 'mock');
    this.appUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');

    if (!this.emailAdapter.isConfigured()) {
      this.logger.warn(
        `Email adapter ${this.emailProvider} is not fully configured. Emails may fail to send.`,
      );
    }
  }

  /**
   * Send booking accepted email
   */
  async sendBookingAcceptedEmail(params: BookingAcceptedEmailParams): Promise<void> {
    try {
      const templateVars = {
        ...params,
        currentYear: new Date().getFullYear(),
        subject: 'Your booking has been accepted',
      };

      const html = this.templateRenderer.renderTemplate('booking-accepted.html', templateVars);
      const text = this.templateRenderer.renderTemplate('booking-accepted.txt', templateVars);

      const emailPayload: EmailPayload = {
        to: params.menteeEmail,
        subject: 'Your booking has been accepted',
        html,
        text,
      };

      const result = await this.emailAdapter.send(emailPayload);

      this.logger.debug(
        `Booking accepted email sent to ${params.menteeEmail}, messageId: ${result.messageId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send booking accepted email to ${params.menteeEmail}:`, error);
      // Don't throw - email failures shouldn't block the main request
    }
  }

  /**
   * Send payment released email
   */
  async sendPaymentReleasedEmail(params: PaymentReleasedEmailParams): Promise<void> {
    try {
      const templateVars = {
        ...params,
        currentYear: new Date().getFullYear(),
        subject: 'Your payment has been released',
      };

      const html = this.templateRenderer.renderTemplate('payment-released.html', templateVars);
      const text = this.templateRenderer.renderTemplate('payment-released.txt', templateVars);

      const emailPayload: EmailPayload = {
        to: params.recipientEmail,
        subject: 'Your payment has been released',
        html,
        text,
      };

      const result = await this.emailAdapter.send(emailPayload);

      this.logger.debug(
        `Payment released email sent to ${params.recipientEmail}, messageId: ${result.messageId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send payment released email to ${params.recipientEmail}:`, error);
      // Don't throw - email failures shouldn't block the main request
    }
  }

  /**
   * Get email provider info
   */
  getEmailProvider(): string {
    return this.emailProvider;
  }

  /**
   * Get app URL
   */
  getAppUrl(): string {
    return this.appUrl;
  }

  /**
   * Build dashboard link for emails
   */
  buildDashboardLink(path: string = 'dashboard'): string {
    return `${this.appUrl}/${path}`;
  }
}
