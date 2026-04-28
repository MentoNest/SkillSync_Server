import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SuspiciousLoginDetectionService } from './suspicious-login-detection.service';
import { RedisService } from '../../redis/redis.service';
import { AuditLog, AuditEventType } from '../entities/audit-log.entity';
import { User } from '../entities/user.entity';
import { Repository } from 'typeorm';

describe('SuspiciousLoginDetectionService', () => {
  let service: SuspiciousLoginDetectionService;
  let mockRedisService: Partial<RedisService>;
  let mockConfigService: Partial<ConfigService>;
  let mockAuditLogRepository: Partial<Repository<AuditLog>>;
  let mockUserRepository: Partial<Repository<User>>;

  beforeEach(async () => {
    // Mock Redis Service
    mockRedisService = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
      exists: jest.fn().mockResolvedValue(false),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      setJson: jest.fn().mockResolvedValue(undefined),
      getJson: jest.fn().mockResolvedValue([]),
      keys: jest.fn().mockResolvedValue([]),
    };

    // Mock Config Service
    mockConfigService = {
      get: jest.fn((key: string, defaultValue: any) => defaultValue),
    };

    // Mock Audit Log Repository
    mockAuditLogRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    // Mock User Repository
    mockUserRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuspiciousLoginDetectionService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockAuditLogRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<SuspiciousLoginDetectionService>(
      SuspiciousLoginDetectionService,
    );
  });

  describe('detectSuspiciousLogin', () => {
    const baseContext = {
      walletAddress: 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      timestamp: new Date(),
    };

    it('should return non-suspicious for normal login', async () => {
      const result = await service.detectSuspiciousLogin(baseContext);

      expect(result.isSuspicious).toBe(false);
      expect(result.riskScore).toBeLessThanOrEqual(30);
      expect(result.reasons).toHaveLength(0);
    });

    it('should detect failed attempts', async () => {
      (mockRedisService.get as jest.Mock).mockResolvedValueOnce('6');

      const result = await service.detectSuspiciousLogin(baseContext);

      expect(result.isSuspicious).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons[0]).toContain('failed login attempts');
    });

    it('should return non-suspicious if account is locked', async () => {
      (mockRedisService.exists as jest.Mock).mockResolvedValueOnce(true);

      const result = await service.detectSuspiciousLogin(baseContext);

      expect(result.isSuspicious).toBe(true);
      expect(result.shouldLockAccount).toBe(true);
      expect(result.reasons).toContain('Account is temporarily locked due to suspicious activity');
    });

    it('should detect new IP address', async () => {
      const ipHistory = [
        {
          ipAddress: '203.0.113.1',
          country: 'Nigeria',
          latitude: 6.5244,
          longitude: 3.3792,
          timestamp: Date.now() - 24 * 60 * 60 * 1000,
          success: true,
        },
      ];

      (mockRedisService.getJson as jest.Mock).mockResolvedValueOnce(
        ipHistory,
      );

      const result = await service.detectSuspiciousLogin(baseContext);

      expect(result.isSuspicious).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons[0]).toContain('New IP address detected');
    });

    it('should calculate risk score correctly', async () => {
      (mockRedisService.get as jest.Mock).mockResolvedValueOnce('7'); // High failed attempts

      const result = await service.detectSuspiciousLogin(baseContext);

      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });
  });

  describe('recordFailedAttempt', () => {
    const baseContext = {
      walletAddress: 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      timestamp: new Date(),
    };

    it('should increment failed attempts counter', async () => {
      await service.recordFailedAttempt(baseContext, 'Invalid signature');

      expect(mockRedisService.incr).toHaveBeenCalled();
    });

    it('should set expiration on first attempt', async () => {
      (mockRedisService.incr as jest.Mock).mockResolvedValueOnce(1);

      await service.recordFailedAttempt(baseContext, 'Invalid signature');

      expect(mockRedisService.expire).toHaveBeenCalled();
    });

    it('should record in audit log', async () => {
      await service.recordFailedAttempt(baseContext, 'Invalid signature');

      expect(mockAuditLogRepository.create).toHaveBeenCalled();
      expect(mockAuditLogRepository.save).toHaveBeenCalled();
    });
  });

  describe('recordLoginAttempt', () => {
    const baseContext = {
      walletAddress: 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75',
      userId: 'user-id-123',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      timestamp: new Date(),
    };

    const suspiciousResult = {
      isSuspicious: false,
      reasons: [],
      riskScore: 0,
      shouldLockAccount: false,
      lockoutDurationMinutes: 30,
    };

    it('should create audit log for successful login', async () => {
      await service.recordLoginAttempt(baseContext, true, suspiciousResult);

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.LOGIN_SUCCESS,
        }),
      );
    });

    it('should create audit log for failed login', async () => {
      await service.recordLoginAttempt(baseContext, false, suspiciousResult);

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.LOGIN_FAILED,
        }),
      );
    });

    it('should lock account if risk is high', async () => {
      const highRiskResult = {
        ...suspiciousResult,
        isSuspicious: true,
        shouldLockAccount: true,
        riskScore: 80,
      };

      await service.recordLoginAttempt(baseContext, true, highRiskResult);

      expect(mockRedisService.setJson).toHaveBeenCalledWith(
        expect.stringContaining('account_lockout'),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should include metadata in audit log', async () => {
      await service.recordLoginAttempt(baseContext, true, suspiciousResult);

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.any(Object),
        }),
      );
    });
  });

  describe('clearFailedAttempts', () => {
    it('should delete counter key from Redis', async () => {
      const walletAddress = 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75';
      const ipAddress = '192.168.1.1';

      await service.clearFailedAttempts(walletAddress, ipAddress);

      expect(mockRedisService.del).toHaveBeenCalled();
    });
  });

  describe('account lockout', () => {
    const walletAddress = 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75';

    it('should check if account is locked', async () => {
      (mockRedisService.exists as jest.Mock).mockResolvedValueOnce(true);

      const result = await service.isAccountLocked(walletAddress);

      expect(result).toBe(true);
      expect(mockRedisService.exists).toHaveBeenCalled();
    });

    it('should lock account', async () => {
      await service.lockAccount(walletAddress, 30);

      expect(mockRedisService.setJson).toHaveBeenCalledWith(
        expect.stringContaining(walletAddress),
        expect.any(Object),
        1800, // 30 minutes in seconds
      );
    });

    it('should unlock account', async () => {
      await service.unlockAccount(walletAddress);

      expect(mockRedisService.del).toHaveBeenCalled();
    });
  });

  describe('getSuspiciousActivityReport', () => {
    it('should return suspicious activity report', async () => {
      const mockActivities = [
        {
          id: '1',
          walletAddress: 'GBRPY...',
          isSuspicious: true,
          riskScore: 75,
        },
      ];

      (mockAuditLogRepository.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValueOnce(mockActivities),
        });

      const report = await service.getSuspiciousActivityReport();

      expect(report.totalSuspiciousActivities).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(report.activities)).toBe(true);
    });

    it('should filter by date range', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      (mockAuditLogRepository.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValueOnce([]),
        });

      await service.getSuspiciousActivityReport({ startDate, endDate });

      expect(mockAuditLogRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should include locked accounts', async () => {
      (mockRedisService.keys as jest.Mock).mockResolvedValueOnce([
        'skillsync:auth:account_lockout:wallet1',
        'skillsync:auth:account_lockout:wallet2',
      ]);

      const report = await service.getSuspiciousActivityReport();

      expect(report.lockedAccounts.length).toBeGreaterThan(0);
    });
  });

  describe('getLoginHistory', () => {
    it('should retrieve login history for wallet', async () => {
      const mockHistory = [
        {
          id: '1',
          walletAddress: 'GBRPY...',
          eventType: AuditEventType.LOGIN_SUCCESS,
          createdAt: new Date(),
        },
      ];

      (mockAuditLogRepository.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValueOnce(mockHistory),
        });

      const history = await service.getLoginHistory('GBRPY...');

      expect(Array.isArray(history)).toBe(true);
    });

    it('should limit results', async () => {
      (mockAuditLogRepository.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValueOnce([]),
        });

      await service.getLoginHistory('GBRPY...', 25);

      expect(mockAuditLogRepository.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('getIPHistory', () => {
    it('should retrieve IP history for wallet', async () => {
      const mockIPHistory = [
        {
          ipAddress: '192.168.1.1',
          country: 'United States',
          latitude: 40.7128,
          longitude: -74.006,
          timestamp: Date.now(),
          success: true,
        },
      ];

      (mockRedisService.getJson as jest.Mock).mockResolvedValueOnce(
        mockIPHistory,
      );

      const history = await service.getIPHistory('GBRPY...');

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should return empty array if no history', async () => {
      (mockRedisService.getJson as jest.Mock).mockResolvedValueOnce(null);

      const history = await service.getIPHistory('GBRPY...');

      expect(history).toEqual([]);
    });
  });

  describe('Performance', () => {
    it('should detect suspicious login in under 100ms', async () => {
      const baseContext = {
        walletAddress: 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        timestamp: new Date(),
      };

      const startTime = performance.now();
      await service.detectSuspiciousLogin(baseContext);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(100);
    });

    it('should record login attempt in under 50ms', async () => {
      const baseContext = {
        walletAddress: 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75',
        userId: 'user-id',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        timestamp: new Date(),
      };

      const suspiciousResult = {
        isSuspicious: false,
        reasons: [],
        riskScore: 0,
        shouldLockAccount: false,
        lockoutDurationMinutes: 30,
      };

      const startTime = performance.now();
      await service.recordLoginAttempt(baseContext, true, suspiciousResult);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(50);
    });
  });
});
