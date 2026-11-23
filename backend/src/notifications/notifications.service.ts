import { Injectable, Logger } from '@nestjs/common';
import type { NotifyInput } from './notification.types';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  notify(input: NotifyInput): Promise<void> {
    this.logger.log(
      `${input.type} to ${input.userId} via ${(input.channels ?? []).join(',') || 'none'}: ${input.title} - ${input.body}`,
    );
    return Promise.resolve();
  }
}
