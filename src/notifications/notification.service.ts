import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Notification } from './notification.entity';
import { NotificationsGateway } from './gateways/notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
    private gateway: NotificationsGateway,
  ) {}

  async createNotification(dto: any) {
    const notification = this.repo.create(dto);
    const saved = await this.repo.save(notification);

    // real-time push
    this.gateway.sendNotification(dto.userId, saved);

    // email placeholder
    if (dto.channel === 'email') {
      console.log('EMAIL SENT (placeholder)', dto);
    }

    return saved;
  }

  async getNotifications(userId: string, page = 1, limit = 20) {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async markAsRead(id: string) {
    return this.repo.update(id, { isRead: true });
  }

  async markAllAsRead(userId: string) {
    return this.repo.update({ userId, isRead: false }, { isRead: true });
  }

  async deleteOldNotifications() {
    const date = new Date();
    date.setDate(date.getDate() - 90);

    return this.repo.delete({
      createdAt: MoreThan(date),
    });
  }
}