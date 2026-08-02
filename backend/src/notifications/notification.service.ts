import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { PaginationService } from '../common/pagination/index.js';
import { RedisService } from '../config/redis.module.js';
import { Notification } from './entities/notification.entity.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';
import { NotificationQueryDto } from './dto/notification-query.dto.js';

const MAX_NOTIFICATIONS_PER_HOUR = 100;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly paginationService: PaginationService,
    private readonly redisService: RedisService,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    await this.enforceRateLimit(dto.userId);

    const notification = this.notificationRepo.create(dto);
    const saved = await this.notificationRepo.save(notification);

    this.logger.log(
      JSON.stringify({
        event: 'NOTIFICATION_CREATED',
        notificationId: saved.id,
        userId: dto.userId,
        type: dto.type,
        timestamp: new Date().toISOString(),
      }),
    );

    return saved;
  }

  async findAll(query: NotificationQueryDto) {
    const qb = this.notificationRepo
      .createQueryBuilder('notification')
      .orderBy('notification.createdAt', 'DESC');

    if (query.type) {
      qb.andWhere('notification.type = :type', { type: query.type });
    }
    if (query.read !== undefined) {
      qb.andWhere('notification.read = :read', {
        read: query.read === 'true',
      });
    }

    return this.paginationService.paginate(qb, query.page, query.limit);
  }

  async findByUser(userId: string, query: NotificationQueryDto) {
    const qb = this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .orderBy('notification.createdAt', 'DESC');

    if (query.type) {
      qb.andWhere('notification.type = :type', { type: query.type });
    }
    if (query.read !== undefined) {
      qb.andWhere('notification.read = :read', {
        read: query.read === 'true',
      });
    }

    return this.paginationService.paginate(qb, query.page, query.limit);
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException(
        'You can only mark your own notifications as read',
      );
    }

    notification.read = true;
    notification.readAt = new Date();

    return this.notificationRepo.save(notification);
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { userId, read: false },
      { read: true, readAt: new Date() },
    );

    this.logger.log(
      JSON.stringify({
        event: 'NOTIFICATIONS_MARKED_ALL_READ',
        userId,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  async batchMarkAsRead(ids: string[], userId: string): Promise<void> {
    await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ read: true, readAt: new Date() })
      .where('id IN (:...ids)', { ids })
      .andWhere('userId = :userId', { userId })
      .execute();
  }

  async deleteOlderThan(days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const result = await this.notificationRepo.delete({
      createdAt: LessThan(cutoff),
    });

    const deletedCount = result.affected ?? 0;

    this.logger.log(
      JSON.stringify({
        event: 'NOTIFICATIONS_CLEANUP',
        days,
        deletedCount,
        timestamp: new Date().toISOString(),
      }),
    );

    return deletedCount;
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { userId, read: false },
    });
  }

  private async enforceRateLimit(userId: string): Promise<void> {
    const key = `notification-rate:${userId}`;
    const count = await this.redisService.incr(key);

    if (count === 1) {
      await this.redisService.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    if (count > MAX_NOTIFICATIONS_PER_HOUR) {
      throw new ForbiddenException(
        `Rate limit exceeded: maximum ${MAX_NOTIFICATIONS_PER_HOUR} notifications per hour`,
      );
    }
  }
}
