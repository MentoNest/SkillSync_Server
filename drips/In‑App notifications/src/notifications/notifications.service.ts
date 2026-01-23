import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Notification } from "./entities/notification.entity";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import {
  ListNotificationsDto,
  NotificationFilter,
} from "./dto/list-notifications.dto";

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  /**
   * Create a new notification - called by other modules
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepo.create(dto);
    return this.notificationRepo.save(notification);
  }

  /**
   * Get paginated list of notifications for a user
   */
  async findAll(userId: string, dto: ListNotificationsDto) {
    const { page = 1, limit = 20, filter = NotificationFilter.ALL } = dto;
    const skip = (page - 1) * limit;

    const query = this.notificationRepo
      .createQueryBuilder("notification")
      .where("notification.userId = :userId", { userId })
      .orderBy("notification.createdAt", "DESC")
      .skip(skip)
      .take(limit);

    // Apply read/unread filter
    if (filter === NotificationFilter.READ) {
      query.andWhere("notification.read = :read", { read: true });
    } else if (filter === NotificationFilter.UNREAD) {
      query.andWhere("notification.read = :read", { read: false });
    }

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { userId, read: false },
    });
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    notification.read = true;
    return this.notificationRepo.save(notification);
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<{ affected: number }> {
    const result = await this.notificationRepo.update(
      { userId, read: false },
      { read: true },
    );

    return { affected: result.affected || 0 };
  }

  /**
   * Delete old read notifications (cleanup utility)
   */
  async deleteOldNotifications(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.notificationRepo
      .createQueryBuilder()
      .delete()
      .where("read = :read", { read: true })
      .andWhere("createdAt < :cutoffDate", { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}
