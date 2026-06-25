import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { RedisService } from '../redis/redis.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly redisService: RedisService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    await this.checkRateLimit(dto.userId);

    const notification = this.notifRepo.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: dto.data ?? null,
    });

    const saved = await this.notifRepo.save(notification);
    this.gateway.emitToUser(dto.userId, saved);
    return saved;
  }

  async findForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }> {
    const [notifications, total] = await this.notifRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const unreadCount = await this.notifRepo.count({
      where: { userId, isRead: false },
    });

    return { notifications, total, unreadCount };
  }

  async markRead(userId: string, ids?: string[]): Promise<void> {
    if (ids?.length) {
      await this.notifRepo.update(
        { id: In(ids), userId },
        { isRead: true, readAt: new Date() },
      );
    } else {
      await this.notifRepo.update(
        { userId, isRead: false },
        { isRead: true, readAt: new Date() },
      );
    }
  }

  async deleteOlderThan90Days(userId?: string): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const qb = this.notifRepo
      .createQueryBuilder()
      .delete()
      .from(Notification)
      .where('"created_at" < :cutoff', { cutoff });

    if (userId) {
      qb.andWhere('"user_id" = :userId', { userId });
    }

    const result = await qb.execute();
    return result.affected ?? 0;
  }

  private async checkRateLimit(userId: string): Promise<void> {
    const client = this.redisService.getClient();
    const key = `notifRate:${userId}`;
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, 3600);
    if (count > 100) {
      throw new HttpException(
        'Notification rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
