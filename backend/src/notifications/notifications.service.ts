import { Injectable, Logger } from '@nestjs/common';
import type { NotifyInput } from './notification.types';
import { NotificationChannel } from './notification.types';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  notify(input: NotifyInput): Promise<void> {
    const channels = input.channels ?? [];
    if (channels.includes(NotificationChannel.EMAIL)) {
      this.logger.log(
        `[EmailPlaceholder] to=${input.recipientEmail ?? input.userId} subject="${input.title}" body="${input.body}"`,
      );
    }
    this.logger.log(
      `${input.type} to ${input.userId} via ${channels.join(',') || 'none'}: ${input.title} - ${input.body}`,
    );
    return Promise.resolve();
  }
}
