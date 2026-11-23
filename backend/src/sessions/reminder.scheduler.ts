import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionsService } from './sessions.service';

@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger('ReminderScheduler');

  constructor(private readonly sessions: SessionsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendSessionReminders(): Promise<void> {
    try {
      const sent = await this.sessions.sendDueReminders();
      if (sent > 0) {
        this.logger.log(`sent ${sent} session reminder(s)`);
      }
    } catch (error) {
      this.logger.error(
        `failed to send session reminders: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
