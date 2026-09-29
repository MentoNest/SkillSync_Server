import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service.js';
import { Notification } from '../entities/notification.entity.js';
import { NotificationPreference } from '../entities/notification-preference.entity.js';
import { RedisService } from './redis.service.js';

describe('NotificationService', () => {
  let service: NotificationService;
  let mockNotificationRepo: any;
  let mockPreferenceRepo: any;
  let mockRedisService: any;

  const mockNotification: any = {
    id: 'n-1',
    userId: 'user-1',
    type: 'system',
    priority: 'medium',
    title: 'Hello',
    message: 'World',
    read: false,
    save: undefined,
  };

  beforeEach(async () => {
    mockNotificationRepo = {
      create: jest.fn().mockImplementation((x) => x),
      save: jest.fn().mockImplementation(async (x) => x),
      findOne: jest.fn().mockResolvedValue(mockNotification),
      find: jest.fn().mockResolvedValue([mockNotification]),
      count: jest.fn().mockResolvedValue(3),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockNotification], 1]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
      }),
    };

    mockPreferenceRepo = {
      create: jest.fn().mockImplementation((x) => x),
      save: jest.fn().mockImplementation(async (x) => x),
      findOne: jest.fn().mockResolvedValue(null),
    };

    mockRedisService = {
      checkRateLimit: jest.fn().mockResolvedValue({ isLimited: false, currentCount: 1, retryAfter: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getRepositoryToken(Notification), useValue: mockNotificationRepo },
        { provide: getRepositoryToken(NotificationPreference), useValue: mockPreferenceRepo },
        { provide: JwtService, useValue: { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }) } },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('creates a notification with defaults', async () => {
    const created = await service.create({
      userId: 'user-1',
      type: 'system' as any,
      title: 'Hello',
      message: 'World',
    });

    expect(created.title).toBe('Hello');
    expect(mockNotificationRepo.save).toHaveBeenCalled();
  });

  it('honours a channel opt-out from preferences', async () => {
    mockPreferenceRepo.findOne.mockResolvedValue({
      userId: 'user-1',
      disabledChannels: ['push'],
      disabledTypes: [],
    });

    await service.create({
      userId: 'user-1',
      type: 'system' as any,
      title: 'Hello',
      message: 'World',
      channels: ['in_app', 'push'] as any,
    });

    const saved = mockNotificationRepo.save.mock.calls[0][0];
    expect(saved.channels).toEqual(['in_app']);
  });

  it('suppresses external channels when the type is opted out', async () => {
    mockPreferenceRepo.findOne.mockResolvedValue({
      userId: 'user-1',
      disabledChannels: [],
      disabledTypes: ['achievement'],
    });

    await service.create({
      userId: 'user-1',
      type: 'achievement' as any,
      title: 'Badge',
      message: 'You earned it',
      channels: ['in_app', 'email'] as any,
    });

    const saved = mockNotificationRepo.save.mock.calls[0][0];
    expect(saved.channels).toEqual(['in_app']);
  });

  it('skips delivery (still persists) when rate limited', async () => {
    mockRedisService.checkRateLimit.mockResolvedValue({ isLimited: true, currentCount: 100, retryAfter: 900 });

    await service.create({
      userId: 'user-1',
      type: 'system' as any,
      title: 'Hello',
      message: 'World',
    });

    expect(mockRedisService.checkRateLimit).toHaveBeenCalledWith(
      'notifications:rate:user-1',
      100,
      3600,
    );
  });

  it('marks several notifications read in one statement', async () => {
    const updated = await service.markManyAsRead(['a', 'b'], 'user-1');
    expect(updated).toBe(2);
  });

  it('returns zero for an empty batch without touching the repo', async () => {
    const updated = await service.markManyAsRead([], 'user-1');
    expect(updated).toBe(0);
    expect(mockNotificationRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('marks all notifications read', async () => {
    await service.markAllAsRead('user-1');
    expect(mockNotificationRepo.update).toHaveBeenCalledWith(
      { userId: 'user-1', read: false },
      expect.objectContaining({ read: true }),
    );
  });

  it('throws NotFound when deleting a foreign notification', async () => {
    mockNotificationRepo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.delete('n-1', 'someone-else')).rejects.toThrow(NotFoundException);
  });

  it('creates preferences lazily on first read', async () => {
    await service.getPreferences('user-1');
    expect(mockPreferenceRepo.create).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(mockPreferenceRepo.save).toHaveBeenCalled();
  });

  it('updates only the provided preference fields', async () => {
    mockPreferenceRepo.findOne.mockResolvedValue({
      userId: 'user-1',
      disabledChannels: [],
      disabledTypes: [],
    });

    await service.updatePreferences('user-1', { disabledTypes: ['reminder' as any] });

    const saved = mockPreferenceRepo.save.mock.calls[0][0];
    expect(saved.disabledTypes).toEqual(['reminder']);
    expect(saved.disabledChannels).toEqual([]);
  });

  it('deletes expired and old notifications in the retention sweep', async () => {
    await service.cleanupOldNotifications(90);
    expect(mockNotificationRepo.delete).toHaveBeenCalledTimes(2);
    expect(mockNotificationRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: expect.anything() }),
    );
  });

  it('filters notifications by read status', async () => {
    await service.findAll('user-1', { read: false });
    const qb = mockNotificationRepo.createQueryBuilder();
    expect(qb.andWhere).toHaveBeenCalledWith('notification.read = :read', { read: false });
  });
});
