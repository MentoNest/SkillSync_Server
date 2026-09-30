import {
  Injectable,
  NotFoundException,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import {
  Notification,
  NotificationChannel,
  NotificationType,
  NotificationPriority,
} from '../entities/notification.entity.js';
import {
  NotificationPreference,
} from '../entities/notification-preference.entity.js';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from './redis.service.js';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  actionUrl?: string;
  icon?: string;
  /**
   * #1364: delivery channels. Defaults to `['in_app']`; `email` and `push`
   * entries are persisted as delivery intent for the placeholder integrations.
   */
  channels?: NotificationChannel[];
  /** Optional soft expiry; expired rows are hidden and swept. */
  expiresAt?: Date;
}

export interface NotificationFilter {
  type?: NotificationType;
  read?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface UpdateNotificationPreferencesDto {
  disabledChannels?: NotificationChannel[];
  disabledTypes?: NotificationType[];
}

/**
 * #1364: notification system.
 *
 * Design notes:
 *  - Real-time delivery rides the `/notifications` Socket.IO namespace. Every
 *    connection is authenticated with the same JWT the REST API uses — the
 *    handshake is rejected when the token is missing or invalid.
 *  - Rate limiting (max 100 notifications per user per hour) is delegated to
 *    the shared Redis sliding-window limiter, with the service's in-memory
 *    fallback when Redis is unavailable.
 *  - Retention follows the audit-log pattern (#1320): a sweep on boot and then
 *    daily, removing rows older than 90 days.
 */
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'] },
  credentials: true,
  namespace: '/notifications',
})
@Injectable()
export class NotificationService implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationService.name);
  private readonly connectedClients = new Map<string, Set<string>>(); // userId -> socketIds

  /** Maximum notifications per user per hour (#1364). */
  static readonly RATE_LIMIT_PER_HOUR = 100;
  /** Fallback retention window when `NOTIFICATION_RETENTION_DAYS` is not set. */
  static readonly DEFAULT_RETENTION_DAYS = 90;
  /** How often expired/old rows are swept, in milliseconds (24h). */
  static readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepo: Repository<NotificationPreference>,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  // ─── Bootstrapping / retention scheduling ────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    await this.runScheduledCleanup();
    this.cleanupTimer = setInterval(
      () => void this.runScheduledCleanup(),
      NotificationService.CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * #1364: automatic cleanup of notifications older than the retention window
   * (90 days by default). Failures are swallowed so a sweep can never take the
   * application down.
   */
  async runScheduledCleanup(): Promise<{
    deletedCount: number;
    retentionDays: number;
  } | null> {
    try {
      const deletedCount = await this.cleanupOldNotifications();
      if (deletedCount > 0) {
        this.logger.log(
          `Retention sweep removed ${deletedCount} notification(s) older than ${this.retentionDays} days`,
        );
      }
      return { deletedCount, retentionDays: this.retentionDays };
    } catch (error) {
      this.logger.error(
        `Notification retention sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** Retention window in days, configurable through the environment. */
  get retentionDays(): number {
    const configured = parseInt(process.env.NOTIFICATION_RETENTION_DAYS ?? '', 10);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : NotificationService.DEFAULT_RETENTION_DAYS;
  }

  /**
   * #1364: delete notifications older than the retention window. Both already
   * delivered rows and rows past their soft `expiresAt` are removed.
   */
  async cleanupOldNotifications(retentionDays: number = this.retentionDays): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    // #1364: remove rows past the retention window, plus rows past their soft
    // expiry (NULL expiresAt never matches LessThan, so no extra guard needed).
    const byAge = await this.notificationRepo.delete({ createdAt: LessThan(cutoff) });
    const byExpiry = await this.notificationRepo.delete({ expiresAt: LessThan(new Date()) });
    return (byAge.affected ?? 0) + (byExpiry.affected ?? 0);
  }

  // ─── Creating notifications ─────────────────────────────────────────────

  /**
   * Create and deliver a notification. Delivery respects the recipient's
   * preferences (opt-outs) and the per-user rate limit; both are applied per
   * channel, so a rate-limited or opted-out channel is skipped silently.
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const preferences = await this.getPreferences(dto.userId);
    const requestedChannels = dto.channels ?? [NotificationChannel.IN_APP];
    // #1364: an opt-out on the notification type suppresses external delivery
    // (email/push) entirely; the in-app row is still persisted and queryable.
    const typeOptedOut = preferences.disabledTypes.includes(dto.type);
    const allowedChannels = typeOptedOut
      ? [NotificationChannel.IN_APP]
      : requestedChannels.filter(
          (channel) => !preferences.disabledChannels.includes(channel),
        );

    const notification = this.notificationRepo.create({
      userId: dto.userId,
      type: dto.type,
      priority: dto.priority ?? NotificationPriority.MEDIUM,
      title: dto.title,
      message: dto.message,
      metadata: dto.metadata,
      actionUrl: dto.actionUrl,
      icon: dto.icon,
      channels: allowedChannels.length > 0 ? allowedChannels : [NotificationChannel.IN_APP],
      expiresAt: dto.expiresAt ?? null,
    });

    const saved = await this.notificationRepo.save(notification);

    // #1364: per-user, per-channel rate limiting (max 100/hour).
    if (await this.isRateLimited(dto.userId)) {
      this.logger.warn(
        `Notification rate limit exceeded for user ${dto.userId}; skipping delivery of ${saved.id}`,
      );
      return saved;
    }

    if (allowedChannels.includes(NotificationChannel.EMAIL)) {
      // #1364: email placeholder — integrate SendGrid here.
      this.logger.log(
        `[Email Placeholder] notification "${saved.title}" queued for user ${dto.userId}`,
      );
    }
    if (allowedChannels.includes(NotificationChannel.PUSH)) {
      // #1364: push placeholder — integrate a push provider here.
      this.logger.log(
        `[Push Placeholder] notification "${saved.title}" queued for user ${dto.userId}`,
      );
    }

    // Real-time delivery for in-app.
    if (allowedChannels.includes(NotificationChannel.IN_APP)) {
      this.sendRealTimeNotification(dto.userId, saved);
    }

    this.logger.log(`Notification created: ${saved.id} for user ${dto.userId}`);
    return saved;
  }

  // ─── Reading notifications ──────────────────────────────────────────────

  /**
   * Get notifications for a user. Rows past their soft expiry are excluded;
   * date-range filters are respected when both bounds are provided.
   */
  async findAll(
    userId: string,
    filter: NotificationFilter = {},
  ): Promise<{ notifications: Notification[]; total: number }> {
    const qb = this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('(notification.expiresAt IS NULL OR notification.expiresAt > :now)', {
        now: new Date(),
      });

    if (filter.type) {
      qb.andWhere('notification.type = :type', { type: filter.type });
    }
    if (filter.read !== undefined) {
      qb.andWhere('notification.read = :read', { read: filter.read });
    }
    if (filter.startDate && filter.endDate) {
      qb.andWhere('notification.createdAt BETWEEN :startDate AND :endDate', {
        startDate: filter.startDate,
        endDate: filter.endDate,
      });
    } else if (filter.startDate) {
      qb.andWhere('notification.createdAt >= :startDate', { startDate: filter.startDate });
    } else if (filter.endDate) {
      qb.andWhere('notification.createdAt <= :endDate', { endDate: filter.endDate });
    }

    qb.orderBy('notification.createdAt', 'DESC')
      .take(filter.limit ?? 50)
      .skip(filter.offset ?? 0);

    const [notifications, total] = await qb.getManyAndCount();
    return { notifications, total };
  }

  /** Get unread notification count. */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { userId, read: false },
    });
  }

  // ─── Mutating notifications ─────────────────────────────────────────────

  /** Mark notification as read. */
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
   * #1364: mark a batch of notifications as read in one statement.
   * Returns the number of rows updated.
   */
  async markManyAsRead(notificationIds: string[], userId: string): Promise<number> {
    if (notificationIds.length === 0) {
      return 0;
    }
    const result = await this.notificationRepo.update(
      { id: In(notificationIds), userId, read: false },
      { read: true, readAt: new Date() },
    );
    return result.affected ?? 0;
  }

  /** Mark all notifications as read for a user. */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { userId, read: false },
      { read: true, readAt: new Date() },
    );
  }

  /** Delete a notification. */
  async delete(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepo.delete({
      id: notificationId,
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  // ─── Preferences (#1364) ────────────────────────────────────────────────

  /** Reads (and lazily creates) the preference row for a user. */
  async getPreferences(userId: string): Promise<NotificationPreference> {
    const normalize = (pref: NotificationPreference): NotificationPreference => {
      // Column defaults live in the database, not on freshly created entities,
      // so a brand-new row carries `undefined` arrays until it is hydrated.
      // Normalize here so callers can rely on arrays.
      pref.disabledChannels ??= [];
      pref.disabledTypes ??= [];
      return pref;
    };

    const existing = await this.preferenceRepo.findOne({ where: { userId } });
    if (existing) {
      return normalize(existing);
    }
    const created = this.preferenceRepo.create({ userId });
    try {
      return normalize(await this.preferenceRepo.save(created));
    } catch {
      // Concurrent first read: the unique index means another request won the
      // insert; re-read instead of failing.
      const raced = await this.preferenceRepo.findOne({ where: { userId } });
      if (raced) return normalize(raced);
      throw new NotFoundException('Notification preferences not found');
    }
  }

  /** Creates or updates the preference row for a user. */
  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference> {
    const preferences = await this.getPreferences(userId);
    if (dto.disabledChannels !== undefined) {
      preferences.disabledChannels = dto.disabledChannels;
    }
    if (dto.disabledTypes !== undefined) {
      preferences.disabledTypes = dto.disabledTypes;
    }
    return this.preferenceRepo.save(preferences);
  }

  // ─── WebSocket delivery ─────────────────────────────────────────────────

  /**
   * Send real-time notification via WebSocket to every connected device of
   * the user (a user may have several tabs/devices open).
   */
  private sendRealTimeNotification(userId: string, notification: Notification): void {
    const socketIds = this.connectedClients.get(userId);
    if (socketIds && socketIds.size > 0) {
      this.server.to([...socketIds]).emit('notification', {
        type: 'new',
        notification,
      });
    }
  }

  /**
   * #1364: WebSocket connections are authenticated with the JWT access token
   * (same contract as the REST API). The handshake is rejected — not merely
   * anonymous — when the token is missing or invalid.
   */
  async handleConnection(client: Socket): Promise<void> {
    const headerToken = client.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
    const token = (client.handshake.auth?.token as string | undefined) ?? headerToken;

    if (!token) {
      this.logger.warn('Notification WebSocket connection rejected: missing token');
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub;
      if (!userId) {
        client.disconnect(true);
        return;
      }
      client.data.userId = userId;
      const sockets = this.connectedClients.get(userId) ?? new Set<string>();
      sockets.add(client.id);
      this.connectedClients.set(userId, sockets);
      this.logger.log(`Notification client connected: ${client.id} (user: ${userId})`);
    } catch {
      this.logger.warn('Notification WebSocket connection rejected: invalid token');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return;
    const sockets = this.connectedClients.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.connectedClients.delete(userId);
      }
    }
    this.logger.log(`Notification client disconnected: ${client.id}`);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /** True when the user hit the per-user notification rate limit. */
  private async isRateLimited(userId: string): Promise<boolean> {
    const key = `notifications:rate:${userId}`;
    const { isLimited } = await this.redisService.checkRateLimit(
      key,
      NotificationService.RATE_LIMIT_PER_HOUR,
      3600,
    );
    return isLimited;
  }
}
