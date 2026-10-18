import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationBus } from './notification-bus';
import { NotificationRateLimiter } from './notification-rate-limiter';
import {
  DEFAULT_RETENTION_DAYS,
  MANDATORY_TYPES,
  NotificationChannel,
  NotificationType,
  NotifyInput,
} from './notification.types';

export interface NotificationQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly limiter = new NotificationRateLimiter();
  private readonly retentionDays: number;

  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationPreference) private readonly preferences: Repository<NotificationPreference>,
    private readonly bus: NotificationBus,
    config: ConfigService,
  ) {
    const days = parseInt(config.get<string>('NOTIFICATION_RETENTION_DAYS') ?? '', 10);
    this.retentionDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS;
  }

  /** Whether the user wants this type (mandatory types always deliver). */
  async isEnabled(userId: string, type: NotificationType): Promise<boolean> {
    if (MANDATORY_TYPES.includes(type)) return true;
    const pref = await this.preferences.findOne({ where: { userId, type } });
    return pref ? pref.enabled : true;
  }

  /**
   * Creates and delivers a notification. Never throws for delivery problems:
   * a failed email must not break the action that triggered it.
   */
  async notify(input: NotifyInput): Promise<Notification | null> {
    const channels = input.channels ?? [NotificationChannel.IN_APP];
    try {
      if (!(await this.isEnabled(input.userId, input.type))) return null;

      let saved: Notification | null = null;
      if (channels.includes(NotificationChannel.IN_APP) && this.limiter.tryAcquire(input.userId, NotificationChannel.IN_APP)) {
        saved = await this.notifications.save(
          this.notifications.create({
            userId: input.userId,
            type: input.type,
            title: input.title.slice(0, 200),
            body: input.body,
            data: input.data ?? null,
          }),
        );
        this.bus.publish(saved);
      }

      if (channels.includes(NotificationChannel.EMAIL) && this.limiter.tryAcquire(input.userId, NotificationChannel.EMAIL)) {
        // Placeholder for the SendGrid integration.
        this.logger.log(`[email placeholder] to=${input.userId} subject="${input.title}"`);
      }
      if (channels.includes(NotificationChannel.PUSH) && this.limiter.tryAcquire(input.userId, NotificationChannel.PUSH)) {
        this.logger.log(`[push placeholder] to=${input.userId} title="${input.title}"`);
      }
      return saved;
    } catch (err) {
      this.logger.warn(`Notification delivery failed for ${input.userId}: ${(err as Error).message}`);
      return null;
    }
  }

  async list(userId: string, query: NotificationQuery = {}) {
    const page = query.page && query.page >= 1 ? query.page : 1;
    const limit = Math.min(query.limit && query.limit >= 1 ? query.limit : 20, 100);
    const [items, total] = await this.notifications.findAndCount({
      where: query.unreadOnly ? { userId, isRead: false } : { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit, unread: await this.notifications.count({ where: { userId, isRead: false } }) };
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notifications.findOne({ where: { id, userId } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }
    return notification;
  }

  /** Batch update; ids that do not belong to the user are ignored. */
  async markManyRead(userId: string, ids: string[]): Promise<{ updated: number }> {
    if (ids.length === 0) return { updated: 0 };
    const res = await this.notifications.update(
      { userId, id: In(ids), isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { updated: res.affected ?? 0 };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.notifications.update({ userId, isRead: false }, { isRead: true, readAt: new Date() });
    return { updated: res.affected ?? 0 };
  }

  async getPreferences(userId: string): Promise<Record<NotificationType, boolean>> {
    const rows = await this.preferences.find({ where: { userId } });
    const result = {} as Record<NotificationType, boolean>;
    for (const type of Object.values(NotificationType)) {
      result[type] = MANDATORY_TYPES.includes(type) ? true : (rows.find((r) => r.type === type)?.enabled ?? true);
    }
    return result;
  }

  async setPreference(userId: string, type: NotificationType, enabled: boolean): Promise<void> {
    if (MANDATORY_TYPES.includes(type) && !enabled) return; // cannot opt out
    const existing = await this.preferences.findOne({ where: { userId, type } });
    if (existing) {
      existing.enabled = enabled;
      await this.preferences.save(existing);
    } else {
      await this.preferences.save(this.preferences.create({ userId, type, enabled }));
    }
  }

  /** Daily cleanup of notifications older than the retention period (default 90 days). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOld(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.retentionDays * 86_400_000);
    const res = await this.notifications.delete({ createdAt: LessThan(cutoff) });
    const removed = res.affected ?? 0;
    if (removed) this.logger.log(`Removed ${removed} notification(s) older than ${this.retentionDays} days`);
    return removed;
  }
}
