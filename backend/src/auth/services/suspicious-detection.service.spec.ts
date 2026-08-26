import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SuspiciousDetectionService } from './suspicious-detection.service';
import { AuditLog } from '../entities/audit-log.entity';
import { User, ProfileType } from '../../user/entities/user.entity';
import { RedisService } from './redis.service';
import { NotificationService } from './notification.service';

describe('SuspiciousDetectionService', () => {
  let service: SuspiciousDetectionService;
  let mockAuditLogRepo: any;
  let mockUserRepo: any;
  let mockRedisService: any;
  let mockNotificationService: any;

  beforeEach(async () => {
    mockAuditLogRepo = {
      save: jest.fn().mockImplementation((a) => Promise.resolve(a)),
      create: jest.fn().mockImplementation((a) => a),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };

    mockUserRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
    };

    mockRedisService = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationService = {
      sendAdminAlert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuspiciousDetectionService,
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditLogRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: RedisService, useValue: mockRedisService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<SuspiciousDetectionService>(SuspiciousDetectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordFailedLogin', () => {
    it('should flag suspicious and lock when failed attempts exceed threshold', async () => {
      mockRedisService.incr.mockResolvedValue(6); // > MAX_FAILED_ATTEMPTS (5)
      mockUserRepo.findOne.mockResolvedValue({ id: 'user-1', email: 'test@example.com', isLocked: false });

      const result = await service.recordFailedLogin({
        email: 'test@example.com',
        ipAddress: '192.168.1.50',
      });

      expect(result.isSuspicious).toBe(true);
      expect(result.lockAccount).toBe(true);
      expect(mockNotificationService.sendAdminAlert).toHaveBeenCalled();
    });
  });
});
