import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/user-role.enum';
import { User } from '../../user/entities/user.entity';
import { Notification, NotificationType } from '../entities/notification.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createForUser(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId,
      type,
      title,
      message,
      metadata,
    });

    return this.notificationRepository.save(notification);
  }

  async createForUsers(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<Notification[]> {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUserIds.length === 0) {
      return [];
    }

    const notifications = uniqueUserIds.map(userId =>
      this.notificationRepository.create({
        userId,
        type,
        title,
        message,
        metadata,
      }),
    );

    return this.notificationRepository.save(notifications);
  }

  async createForAdmins(
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<Notification[]> {
    const admins = await this.userRepository.find({
      where: {
        role: UserRole.ADMIN,
        isActive: true,
      },
      select: ['id'],
    });

    return this.createForUsers(
      admins.map(admin => admin.id),
      type,
      title,
      message,
      metadata,
    );
  }

  async findAllForUser(userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneForUser(userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  async markAsRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.findOneForUser(userId, id);
    if (notification.isRead) {
      return notification;
    }

    notification.isRead = true;
    notification.readAt = new Date();
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const unread = await this.notificationRepository.find({
      where: { userId, isRead: false },
      select: ['id'],
    });

    if (unread.length === 0) {
      return { updated: 0 };
    }

    await this.notificationRepository.update(
      { id: In(unread.map(item => item.id)) },
      { isRead: true, readAt: new Date() },
    );

    return { updated: unread.length };
  }

  async removeForUser(userId: string, id: string): Promise<void> {
    const notification = await this.findOneForUser(userId, id);
    await this.notificationRepository.remove(notification);
  }
}
