import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Notification, NotificationType, NotificationPriority } from '../entities/notification.entity';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  actionUrl?: string;
  icon?: string;
}

export interface NotificationFilter {
  type?: NotificationType;
  read?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notifications',
})
@Injectable()
export class NotificationService implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationService.name);
  private readonly connectedClients = new Map<string, string>(); // userId -> socketId

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  /**
   * Create and send a notification
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId: dto.userId,
      type: dto.type,
      priority: dto.priority || NotificationPriority.MEDIUM,
      title: dto.title,
      message: dto.message,
      metadata: dto.metadata,
      actionUrl: dto.actionUrl,
      icon: dto.icon,
    });

    const saved = await this.notificationRepo.save(notification);

    // Send real-time notification via WebSocket
    this.sendRealTimeNotification(dto.userId, saved);

    this.logger.log(`Notification created: ${saved.id} for user ${dto.userId}`);
    return saved;
  }

  /**
   * Get notifications for a user
   */
  async findAll(userId: string, filter: NotificationFilter = {}): Promise<{ notifications: Notification[]; total: number }> {
    const where: any = { userId };

    if (filter.type) {
      where.type = filter.type;
    }

    if (filter.read !== undefined) {
      where.read = filter.read;
    }

    if (filter.startDate || filter.endDate) {
      where.createdAt = {};
      if (filter.startDate) {
        where.createdAt = LessThan(filter.startDate);
      }
    }

    const [notifications, total] = await this.notificationRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: filter.limit || 50,
      skip: filter.offset || 0,
    });

    return { notifications, total };
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { userId, read: false },
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.read = true;
    notification.readAt = new Date();

    return this.notificationRepo.save(notification);
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { userId, read: false },
      { read: true, readAt: new Date() },
    );
  }

  /**
   * Delete a notification
   */
  async delete(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepo.delete({
      id: notificationId,
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Delete old notifications (cleanup)
   */
  async cleanupOldNotifications(daysOld: number = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const result = await this.notificationRepo.delete({
      createdAt: LessThan(cutoff),
    });

    this.logger.log(`Cleaned up ${result.affected} old notifications`);
    return result.affected || 0;
  }

  /**
   * Send real-time notification via WebSocket
   */
  private sendRealTimeNotification(userId: string, notification: Notification): void {
    const socketId = this.connectedClients.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('notification', {
        type: 'new',
        notification,
      });
    }
  }

  /**
   * Handle WebSocket connection
   */
  handleConnection(client: Socket): void {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      this.connectedClients.set(userId, client.id);
      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnect(client: Socket): void {
    const userId = Array.from(this.connectedClients.entries())
      .find(([_, socketId]) => socketId === client.id)?.[0];

    if (userId) {
      this.connectedClients.delete(userId);
      this.logger.log(`Client disconnected: ${client.id} (user: ${userId})`);
    }
  }

  /**
   * Handle join event for specific user room
   */
  @SubscribeMessage('join')
  handleJoin(client: Socket, userId: string): void {
    client.join(`user:${userId}`);
    this.logger.log(`Client ${client.id} joined room user:${userId}`);
  }
}
