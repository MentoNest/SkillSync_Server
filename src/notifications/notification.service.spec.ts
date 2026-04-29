import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsService } from './notification.service';
import { Notification } from './notification.entity';
import { NotificationsGateway } from './gateways/notifications.gateway';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepository: Repository<Notification>;
  let gateway: NotificationsGateway;

  const mockNotificationRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockResolvedValue({
      id: 'notif-123',
      userId: 'user-123',
      message: 'Test notification',
      isRead: false,
      createdAt: new Date(),
    }),
    find: jest.fn().mockResolvedValue([
      {
        id: 'notif-123',
        userId: 'user-123',
        message: 'Test notification',
        isRead: false,
        createdAt: new Date(),
      },
    ]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 5 }),
  };

  const mockGateway = {
    sendNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: mockNotificationRepository },
        { provide: NotificationsGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    notificationRepository = module.get<Repository<Notification>>(getRepositoryToken(Notification));
    gateway = module.get<NotificationsGateway>(NotificationsGateway);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createNotification', () => {
    it('should create a notification successfully', async () => {
      const dto = {
        userId: 'user-123',
        message: 'Test notification',
        channel: 'websocket',
      };

      const result = await service.createNotification(dto);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('message');
      expect(notificationRepository.create).toHaveBeenCalledWith(dto);
      expect(notificationRepository.save).toHaveBeenCalled();
    });

    it('should send notification via gateway', async () => {
      const dto = {
        userId: 'user-123',
        message: 'Test notification',
        channel: 'websocket',
      };

      await service.createNotification(dto);

      expect(gateway.sendNotification).toHaveBeenCalledWith('user-123', expect.anything());
    });

    it('should log email when channel is email', async () => {
      const dto = {
        userId: 'user-123',
        message: 'Email notification',
        channel: 'email',
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.createNotification(dto);

      expect(consoleSpy).toHaveBeenCalledWith('EMAIL SENT (placeholder)', dto);

      consoleSpy.mockRestore();
    });
  });

  describe('getNotifications', () => {
    it('should get notifications with default pagination', async () => {
      const userId = 'user-123';
      const result = await service.getNotifications(userId);

      expect(notificationRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should get notifications with custom pagination', async () => {
      const userId = 'user-123';
      const page = 2;
      const limit = 10;

      await service.getNotifications(userId, page, limit);

      expect(notificationRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    });

    it('should order notifications by createdAt descending', async () => {
      const userId = 'user-123';

      await service.getNotifications(userId);

      expect(notificationRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const notificationId = 'notif-123';
      const result = await service.markAsRead(notificationId);

      expect(notificationRepository.update).toHaveBeenCalledWith(notificationId, {
        isRead: true,
      });
      expect(result).toHaveProperty('affected');
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read for user', async () => {
      const userId = 'user-123';
      const result = await service.markAllAsRead(userId);

      expect(notificationRepository.update).toHaveBeenCalledWith(
        { userId, isRead: false },
        { isRead: true },
      );
      expect(result).toHaveProperty('affected');
    });
  });

  describe('deleteOldNotifications', () => {
    it('should delete notifications older than 90 days', async () => {
      const result = await service.deleteOldNotifications();

      expect(notificationRepository.delete).toHaveBeenCalledWith({
        createdAt: expect.anything(),
      });
      expect(result).toHaveProperty('affected');
    });

    it('should calculate correct date threshold', async () => {
      await service.deleteOldNotifications();

      const deleteCall = mockNotificationRepository.delete.mock.calls[0][0];
      const thresholdDate = deleteCall.createdAt;

      // Should be approximately 90 days ago
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      expect(thresholdDate.getTime()).toBeCloseTo(ninetyDaysAgo.getTime(), -3);
    });
  });
});
