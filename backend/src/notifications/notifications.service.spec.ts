import { NotFoundException } from '@nestjs/common';
import { NotificationBus } from './notification-bus';
import { NotificationRateLimiter } from './notification-rate-limiter';
import { NotificationsService } from './notifications.service';
import { NotificationChannel, NotificationType } from './notification.types';

function build(prefs: any[] = []) {
  const notifications: any = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: any) => Promise.resolve({ id: 'n1', createdAt: new Date(), ...v })),
    findOne: jest.fn(),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({ affected: 2 }),
    delete: jest.fn().mockResolvedValue({ affected: 3 }),
  };
  const preferences: any = {
    findOne: jest.fn((q: any) => Promise.resolve(prefs.find((p) => p.userId === q.where.userId && p.type === q.where.type) ?? null)),
    find: jest.fn().mockResolvedValue(prefs),
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: unknown) => Promise.resolve(v)),
  };
  const bus = new NotificationBus();
  const published: any[] = [];
  bus.stream('u1').subscribe((n) => published.push(n));
  const service = new NotificationsService(notifications, preferences, bus, { get: () => undefined } as any);
  return { service, notifications, preferences, published };
}

const input = {
  userId: 'u1',
  type: NotificationType.MESSAGE,
  title: 'Hello',
  body: 'World',
};

describe('NotificationsService', () => {
  it('stores an in-app notification and publishes it for real-time delivery', async () => {
    const { service, notifications, published } = build();
    const result = await service.notify(input);
    expect(result?.id).toBe('n1');
    expect(notifications.save).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(1);
  });

  it('skips types the user opted out of', async () => {
    const { service, notifications } = build([{ userId: 'u1', type: NotificationType.MESSAGE, enabled: false }]);
    expect(await service.notify(input)).toBeNull();
    expect(notifications.save).not.toHaveBeenCalled();
  });

  it('always delivers mandatory types and refuses to opt out of them', async () => {
    const { service, notifications, preferences } = build([
      { userId: 'u1', type: NotificationType.SUSPENSION_WARNING, enabled: false },
    ]);
    await service.notify({ ...input, type: NotificationType.SUSPENSION_WARNING });
    expect(notifications.save).toHaveBeenCalledTimes(1);

    await service.setPreference('u1', NotificationType.SUSPENSION_WARNING, false);
    expect(preferences.save).not.toHaveBeenCalled();
  });

  it('handles the email placeholder channel without storing a second row', async () => {
    const { service, notifications } = build();
    await service.notify({ ...input, channels: [NotificationChannel.EMAIL] });
    expect(notifications.save).not.toHaveBeenCalled();
  });

  it('never throws when delivery fails', async () => {
    const { service, notifications } = build();
    notifications.save.mockRejectedValue(new Error('db down'));
    await expect(service.notify(input)).resolves.toBeNull();
  });

  it('marks one notification read and 404s for foreign ones', async () => {
    const { service, notifications } = build();
    notifications.findOne.mockResolvedValue({ id: 'n1', userId: 'u1', isRead: false, readAt: null });
    expect((await service.markRead('u1', 'n1')).isRead).toBe(true);
    notifications.findOne.mockResolvedValue(null);
    await expect(service.markRead('u1', 'other')).rejects.toThrow(NotFoundException);
  });

  it('marks many notifications read in one batch', async () => {
    const { service, notifications } = build();
    expect(await service.markManyRead('u1', ['a', 'b'])).toEqual({ updated: 2 });
    expect(notifications.update).toHaveBeenCalledTimes(1);
    expect(await service.markManyRead('u1', [])).toEqual({ updated: 0 });
  });

  it('paginates and reports the unread count', async () => {
    const { service, notifications } = build();
    notifications.findAndCount.mockResolvedValue([[{ id: 'n1' }], 41]);
    notifications.count.mockResolvedValue(7);
    expect(await service.list('u1', { page: 2, limit: 20 })).toMatchObject({ total: 41, page: 2, limit: 20, unread: 7 });
    expect(notifications.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
  });

  it('deletes notifications older than 90 days', async () => {
    const { service, notifications } = build();
    const now = new Date('2030-06-01T00:00:00Z');
    expect(await service.cleanupOld(now)).toBe(3);
    const where = notifications.delete.mock.calls[0][0];
    const cutoff: Date = where.createdAt.value ?? where.createdAt._value;
    expect(new Date(cutoff).toISOString()).toBe('2030-03-03T00:00:00.000Z');
  });

  it('reports preferences with defaults for every type', async () => {
    const { service } = build([{ userId: 'u1', type: NotificationType.ANNOUNCEMENT, enabled: false }]);
    const prefs = await service.getPreferences('u1');
    expect(prefs[NotificationType.ANNOUNCEMENT]).toBe(false);
    expect(prefs[NotificationType.MESSAGE]).toBe(true);
    expect(prefs[NotificationType.SUSPENSION_WARNING]).toBe(true);
  });
});

describe('NotificationRateLimiter', () => {
  it('limits per user and channel within the window', () => {
    const limiter = new NotificationRateLimiter(2, 1000);
    expect(limiter.tryAcquire('u1', 'in_app', 0)).toBe(true);
    expect(limiter.tryAcquire('u1', 'in_app', 1)).toBe(true);
    expect(limiter.tryAcquire('u1', 'in_app', 2)).toBe(false);
    expect(limiter.tryAcquire('u1', 'email', 2)).toBe(true);
    expect(limiter.tryAcquire('u2', 'in_app', 2)).toBe(true);
    expect(limiter.tryAcquire('u1', 'in_app', 1500)).toBe(true);
  });
});
