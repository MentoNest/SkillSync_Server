import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RedisNamespace } from '../redis/redis.config';
import { RedisService } from '../redis/redis.service';
import { ResourceNotFoundException } from '../common/errors/app-exceptions';
import { NotificationPreference } from './notification-preference.entity';
import { Notification } from './notification.entity';
import {
  NotificationPreferenceResponseDto,
  NotificationPreferenceUpdateDto,
} from './dto/notification-preferences.dto';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationChannel, NotificationType } from './notification.types';
import { NotificationGateway } from './notification.gateway';

const RATE_LIMIT_PER_HOUR = 100;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferences: Repository<NotificationPreference>,
    private readonly redis: RedisService,
    private readonly gateway: NotificationGateway,
  ) {}

  onModuleInit(): void {
    void this.cleanupExpiredNotifications().catch((error: unknown) => {
      this.logger.error(
        'Initial notification cleanup failed',
        error instanceof Error ? error.stack : String(error),
      );
    });
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredNotifications().catch((error: unknown) => {
        this.logger.error(
          'Scheduled notification cleanup failed',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async create(userId: string, dto: CreateNotificationDto): Promise<Notification | null> {
    const preference = await this.preferences.findOneBy({ userId, type: dto.type });
    if (preference?.optedOut) return null;

    const channels = dto.channels?.length ? dto.channels : [NotificationChannel.IN_APP];
    const hourWindow = Math.floor(Date.now() / 3_600_000);

    for (const channel of channels) {
      const count = await this.redis.incrementWithExpiry(
        RedisNamespace.RATE_LIMIT,
        `notification:${userId}:${channel}:${hourWindow}`,
        3_600,
      );
      if (count > RATE_LIMIT_PER_HOUR) {
        throw new HttpException(
          `Notification limit exceeded for ${channel}; maximum ${RATE_LIMIT_PER_HOUR} per hour`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const notification = await this.notifications.save(
      this.notifications.create({
        userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        data: dto.data ?? {},
      }),
    );

    if (channels.includes(NotificationChannel.IN_APP)) {
      this.gateway.emitToUser(userId, notification);
    }
    for (const channel of channels) {
      if (channel === NotificationChannel.EMAIL || channel === NotificationChannel.PUSH) {
        this.logger.debug(`${channel} delivery is not configured`);
      }
    }

    return notification;
  }

  async list(userId: string, query: NotificationQueryDto): Promise<{
    notifications: Notification[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const where = query.unreadOnly ? { userId, isRead: false } : { userId };
    const [notifications, total] = await this.notifications.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });
    return { notifications, total, limit: query.limit, offset: query.offset };
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notifications.findOneBy({ id, userId });
    if (!notification) throw new ResourceNotFoundException('Notification', id);
    if (!notification.isRead) {
      notification.isRead = true;
      await this.notifications.save(notification);
    }
    return notification;
  }

  async markManyRead(userId: string, ids: string[]): Promise<{ updated: number }> {
    const result = await this.notifications.update(
      { userId, id: In(ids), isRead: false },
      { isRead: true },
    );
    return { updated: result.affected ?? 0 };
  }

  async getPreferences(userId: string): Promise<NotificationPreferenceResponseDto[]> {
    const saved = await this.preferences.findBy({ userId });
    const savedByType = new Map(saved.map((preference) => [preference.type, preference]));
    return Object.values(NotificationType).map((type) => ({
      type,
      enabled: !savedByType.get(type)?.optedOut,
    }));
  }

  async updatePreferences(
    userId: string,
    updates: NotificationPreferenceUpdateDto[],
  ): Promise<NotificationPreferenceResponseDto[]> {
    await this.preferences.save(
      updates.map((update) =>
        this.preferences.create({
          userId,
          type: update.type,
          optedOut: !update.enabled,
        }),
      ),
    );
    return this.getPreferences(userId);
  }

  async cleanupExpiredNotifications(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.notifications
      .createQueryBuilder()
      .delete()
      .where('"created_at" < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }
}
