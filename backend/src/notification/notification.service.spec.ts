import { HttpException, HttpStatus } from '@nestjs/common';
import { In } from 'typeorm';
import { NotificationPreference } from './notification-preference.entity';
import { Notification } from './notification.entity';
import { NotificationService } from './notification.service';
import { NotificationChannel, NotificationType } from './notification.types';

describe('NotificationService', () => {
  const userId = 'G'.repeat(56);
  const notification = {
    id: '42bf84d8-6ee9-4ad0-a755-9a58acba12e2',
    userId,
    type: NotificationType.MESSAGE,
    title: 'New message',
    body: 'You have a message',
    data: { messageId: 'message-1' },
    isRead: false,
    createdAt: new Date(),
  };

  let service: NotificationService;
  let notifications: {
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    findOneBy: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let preferences: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    findBy: jest.Mock;
  };
  let redis: { incrementWithExpiry: jest.Mock };
  let gateway: { emitToUser: jest.Mock };
  let queryBuilder: {
    delete: jest.Mock;
    where: jest.Mock;
    execute: jest.Mock;
  };

  beforeEach(() => {
    notifications = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(notification),
      findAndCount: jest.fn().mockResolvedValue([[notification], 1]),
      findOneBy: jest.fn().mockResolvedValue(notification),
      update: jest.fn().mockResolvedValue({ affected: 2 }),
      createQueryBuilder: jest.fn(),
    };
    preferences = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue(null),
      findBy: jest.fn().mockResolvedValue([]),
    };
    redis = { incrementWithExpiry: jest.fn().mockResolvedValue(1) };
    gateway = { emitToUser: jest.fn() };
    queryBuilder = {
      delete: jest.fn(),
      where: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affected: 3 }),
    };
    queryBuilder.delete.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    notifications.createQueryBuilder.mockReturnValue(queryBuilder);

    service = new NotificationService(
      notifications as never,
      preferences as never,
      redis as never,
      gateway as never,
    );
  });

  it('creates and delivers in-app notifications to the recipient', async () => {
    await expect(
      service.create(userId, {
        type: NotificationType.MESSAGE,
        title: notification.title,
        body: notification.body,
        data: notification.data,
      }),
    ).resolves.toEqual(notification);

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId, data: notification.data }),
    );
    expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(`${userId}:in_app:`),
      3600,
    );
    expect(gateway.emitToUser).toHaveBeenCalledWith(userId, notification);
  });

  it('does not deliver notification types the user opted out of', async () => {
    preferences.findOneBy.mockResolvedValue({
      userId,
      type: NotificationType.MESSAGE,
      optedOut: true,
    } satisfies Partial<NotificationPreference>);

    await expect(
      service.create(userId, {
        type: NotificationType.MESSAGE,
        title: 'New message',
        body: 'You have a message',
      }),
    ).resolves.toBeNull();

    expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
    expect(notifications.save).not.toHaveBeenCalled();
    expect(gateway.emitToUser).not.toHaveBeenCalled();
  });

  it('enforces the per-user and per-channel hourly limit', async () => {
    redis.incrementWithExpiry.mockResolvedValue(101);

    await expect(
      service.create(userId, {
        type: NotificationType.MESSAGE,
        title: 'New message',
        body: 'You have a message',
        channels: [NotificationChannel.EMAIL],
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    } satisfies Partial<HttpException>);

    expect(notifications.save).not.toHaveBeenCalled();
  });

  it('lists only the requesting user’s notifications with pagination', async () => {
    const query = { limit: 10, offset: 20, unreadOnly: true };

    await expect(service.list(userId, query)).resolves.toEqual({
      notifications: [notification],
      total: 1,
      ...query,
    });
    expect(notifications.findAndCount).toHaveBeenCalledWith({
      where: { userId, isRead: false },
      order: { createdAt: 'DESC' },
      take: 10,
      skip: 20,
    });
  });

  it('marks a notification as read only for its owner', async () => {
    const unread = { ...notification, isRead: false };
    notifications.findOneBy.mockResolvedValue(unread);
    notifications.save.mockResolvedValue({ ...unread, isRead: true });

    await expect(service.markRead(userId, notification.id)).resolves.toMatchObject({
      id: notification.id,
      isRead: true,
    });
    expect(notifications.findOneBy).toHaveBeenCalledWith({
      id: notification.id,
      userId,
    });
    expect(notifications.save).toHaveBeenCalledWith({ ...unread, isRead: true });
  });

  it('marks only unread notifications belonging to the user as read in a batch', async () => {
    await expect(service.markManyRead(userId, [notification.id])).resolves.toEqual({
      updated: 2,
    });
    expect(notifications.update).toHaveBeenCalledWith(
      { userId, id: In([notification.id]), isRead: false },
      { isRead: true },
    );
  });

  it('returns enabled-by-default preferences and persists opt-outs', async () => {
    preferences.findBy.mockResolvedValue([
      { type: NotificationType.MESSAGE, optedOut: true },
    ]);

    const result = await service.getPreferences(userId);
    expect(result).toContainEqual({ type: NotificationType.MESSAGE, enabled: false });
    expect(result).toContainEqual({ type: NotificationType.SESSION_REMINDER, enabled: true });

    await service.updatePreferences(userId, [
      { type: NotificationType.PLATFORM_ANNOUNCEMENT, enabled: false },
    ]);
    expect(preferences.save).toHaveBeenCalledWith([
      { userId, type: NotificationType.PLATFORM_ANNOUNCEMENT, optedOut: true },
    ]);
  });

  it('deletes notifications older than 90 days', async () => {
    await expect(service.cleanupExpiredNotifications()).resolves.toBe(3);

    expect(queryBuilder.delete).toHaveBeenCalled();
    expect(queryBuilder.where).toHaveBeenCalledWith(
      '"created_at" < :cutoff',
      { cutoff: expect.any(Date) },
    );
  });
});
