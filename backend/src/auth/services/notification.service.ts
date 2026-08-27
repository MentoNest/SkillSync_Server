import { Injectable, Logger } from '@nestjs/common';
import { User } from '../../user/entities/user.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  /**
   * Placeholder for sending session revocation email notification to the user
   */
  async sendSessionRevocationNotification(user: User, revokedCount: number): Promise<void> {
    const contactMethod = user.email || user.walletAddress;
    this.logger.log(
      `[Email/Notification Placeholder] To: ${contactMethod} - All active sessions (${revokedCount}) have been revoked for your account at ${new Date().toISOString()}.`,
    );

    // Optional email notification placeholder for future implementation:
    // e.g. await this.mailerService.sendMail({ to: user.email, subject: 'Security Notice: All Sessions Revoked', ... })
  }

  /**
   * Alert admin via webhook or email when suspicious activity is detected
   */
  async sendAdminAlert(alertData: {
    eventType: string;
    reason: string;
    userId?: string | null;
    walletAddress?: string | null;
    ipAddress?: string | null;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const webhookUrl = process.env.ADMIN_ALERT_WEBHOOK_URL;
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;

    this.logger.warn(
      `[ADMIN SECURITY ALERT] Suspicious Activity Detected: Reason="${alertData.reason}", User="${alertData.userId || alertData.walletAddress}", IP="${alertData.ipAddress}"`,
    );

    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'SUSPICIOUS_LOGIN_ALERT',
            timestamp: new Date().toISOString(),
            ...alertData,
          }),
        });
        this.logger.log(`Admin alert webhook sent successfully to ${webhookUrl}`);
      } catch (err: any) {
        this.logger.error(`Failed to send admin webhook alert: ${err.message}`);
      }
    }

    if (adminEmail) {
      this.logger.log(
        `[Admin Email Alert Placeholder] Alert email sent to admin: ${adminEmail} for suspicious event ${alertData.reason}`,
      );
    }
  }
}
