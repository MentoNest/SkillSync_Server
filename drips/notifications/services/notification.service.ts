import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import {
  CreateNotificationDto,
  ListNotificationsQueryDto,
  PaginatedNotificationsResponseDto,
  NotificationResponseDto,
} from '../dto/notification.dto';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  /**
   * Create a new notification (called by other services/modules)
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId: dto.userId,
      type: dto.type,
      payload: dto.payload,
      isRead: false,
    });

    return this.notificationRepository.save(notification);
  }

  /**
   * Bulk create notifications for multiple users
   */
  async createBulk(
    notifications: CreateNotificationDto[],
  ): Promise<Notification[]> {
    const entities = notifications.map((dto) =>
      this.notificationRepository.create({
        userId: dto.userId,
        type: dto.type,
        payload: dto.payload,
        isRead: false,
      }),
    );

    return this.notificationRepository.save(entities);
  }

  /**
   * List notifications for a user with filtering and pagination
   */
  async list(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<PaginatedNotificationsResponseDto> {
    const { page = 1, limit = 10, read, type } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .orderBy('notification.createdAt', 'DESC');

    // Apply filters
    if (read !== undefined) {
      queryBuilder.andWhere('notification.isRead = :read', { read });
    }

    if (type) {
      queryBuilder.andWhere('notification.type = :type', { type });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated items
    const items = await queryBuilder.skip(skip).take(limit).getMany();

    return {
      items: items.map(this.toResponseDto),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single notification (with ownership check)
   */
  async findOne(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this notification',
      );
    }

    return notification;
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(
    id: string,
    userId: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.findOne(id, userId);

    if (!notification.isRead) {
      notification.isRead = true;
      await this.notificationRepository.save(notification);
    }

    return this.toResponseDto(notification);
  }

  /**
   * Mark all user notifications as read
   */
  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, updatedAt: new Date() })
      .where('userId = :userId', { userId })
      .andWhere('isRead = :isRead', { isRead: false })
      .execute();

    return { updated: result.affected || 0 };
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Delete old read notifications (cleanup job)
   */
  async deleteOldReadNotifications(daysOld: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.notificationRepository
      .createQueryBuilder()
      .delete()
      .where('isRead = :isRead', { isRead: true })
      .andWhere('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }

  private toResponseDto(notification: Notification): NotificationResponseDto {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      payload: notification.payload,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }
}
