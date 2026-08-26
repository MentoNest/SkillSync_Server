import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuditLog } from './entities/audit-log.entity';
import { RedisService } from './services/redis.service';
import { NotificationService } from './services/notification.service';
import { SuspiciousDetectionService } from './services/suspicious-detection.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockRefreshTokenRepo: any;
  let mockAuditLogRepo: any;
  let mockUserService: any;
  let mockRedisService: any;
  let mockSuspiciousDetectionService: any;

  beforeEach(async () => {
    mockRefreshTokenRepo = {
      find: jest.fn().mockResolvedValue([{ id: 'tok-1' }, { id: 'tok-2' }]),
      delete: jest.fn().mockResolvedValue({ affected: 2 }),
      save: jest.fn().mockImplementation((t) => Promise.resolve(t)),
      create: jest.fn().mockImplementation((t) => t),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    mockAuditLogRepo = {
      save: jest.fn().mockImplementation((a) => Promise.resolve(a)),
      create: jest.fn().mockImplementation((a) => a),
    };

    mockUserService = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-123',
        walletAddress: '0x71c841832047387195060979dc80ebbe62dce35b',
        tokenVersion: 1,
        roles: [],
      }),
      incrementTokenVersion: jest.fn().mockResolvedValue(2),
    };

    mockRedisService = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
    };

    mockSuspiciousDetectionService = {
      getGeoLocation: jest.fn().mockReturnValue({ country: 'US', city: 'SF', lat: 37.77, lon: -122.41 }),
      recordFailedLogin: jest.fn(),
      evaluateLogin: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-jwt-token') },
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepo,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockAuditLogRepo,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: NotificationService,
          useValue: {
            sendSessionRevocationNotification: jest.fn(),
            sendAdminAlert: jest.fn(),
          },
        },
        {
          provide: SuspiciousDetectionService,
          useValue: mockSuspiciousDetectionService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('revokeAll', () => {
    it('should delete all refresh tokens, increment token version, and log audit event', async () => {
      const result = await service.revokeAll('user-123', '192.168.1.1', 'Mozilla/5.0');

      expect(mockRefreshTokenRepo.delete).toHaveBeenCalledWith({ userId: 'user-123' });
      expect(mockUserService.incrementTokenVersion).toHaveBeenCalledWith('user-123');
      expect(mockAuditLogRepo.save).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.revokedSessionsCount).toBe(2);
      expect(result.tokenVersion).toBe(2);
    });
  });

  describe('generateNonce', () => {
    it('should generate a nonce challenge and cache in redis', async () => {
      const wallet = '0x71C841832047387195060979DC80EbbE62DCE35B';
      const result = await service.generateNonce(wallet);

      expect(result.walletAddress).toBe(wallet.toLowerCase());
      expect(result.nonce).toContain('Sign this one-time challenge');
      expect(mockRedisService.set).toHaveBeenCalled();
    });
  });
});
