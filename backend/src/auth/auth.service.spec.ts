import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuditLog } from './entities/audit-log.entity';
import { RedisService } from './services/redis.service';
import { NotificationService } from './services/notification.service';
import { SuspiciousDetectionService } from './services/suspicious-detection.service';
import { WalletStrategy } from './strategies/wallet.strategy';

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
        walletAddress: 'ga7qynf7sowq3glr2bgmzehxavirza4kvwltjjfc7mgxua74p7ujvsgz',
        tokenVersion: 1,
        roles: [],
      }),
      findByWalletAddress: jest.fn(),
      create: jest.fn(),
      recordLogin: jest.fn(),
      incrementTokenVersion: jest.fn().mockResolvedValue(2),
    };

    // Simulate Redis-backed nonce storage so issue/consume flows work end-to-end
    const redisStore = new Map<string, string>();
    mockRedisService = {
      set: jest.fn(async (key: string, value: string) => {
        redisStore.set(key, value);
      }),
      get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
      del: jest.fn(async (key: string) => {
        redisStore.delete(key);
      }),
      incr: jest.fn(),
      expire: jest.fn(),
      __store: redisStore,
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
        {
          provide: WalletStrategy,
          useValue: new WalletStrategy(),
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
    const keypair = Keypair.random();
    const wallet = keypair.publicKey();

    it('should generate a 256-bit nonce, store it in Redis with a 5 minute TTL', async () => {
      const result = await service.generateNonce(wallet);

      expect(result.walletAddress).toBe(wallet.toLowerCase());
      expect(result.nonce).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 300_000 + 1000);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `nonce:${wallet.toLowerCase()}`,
        expect.any(String),
        300,
      );
    });

    it('should reject invalid (non-Stellar) wallet addresses', async () => {
      await expect(service.generateNonce('0x71C841832047387195060979DC80EbbE62DCE35B')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should invalidate the previous unused nonce when a new one is requested', async () => {
      const first = await service.generateNonce(wallet);
      const second = await service.generateNonce(wallet);

      expect(second.nonce).not.toBe(first.nonce);
      const stored = JSON.parse(mockRedisService.__store.get(`nonce:${wallet.toLowerCase()}`));
      expect(stored.nonce).toBe(second.nonce);
    });
  });

  describe('login with Stellar wallet signature', () => {
    const keypair = Keypair.random();
    const wallet = keypair.publicKey();
    const mockUser = {
      id: 'user-123',
      walletAddress: wallet.toLowerCase(),
      email: null,
      displayName: 'Stellar User',
      bio: null,
      avatarUrl: null,
      profileType: 'mentee',
      settings: {},
      isLocked: false,
      lockoutUntil: null,
      lastLoginAt: null,
      tokenVersion: 0,
      roles: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const issueNonceAndSign = async () => {
      const nonceResponse = await service.generateNonce(wallet);
      const signature = Buffer.from(keypair.sign(Buffer.from(nonceResponse.nonce, 'utf8'))).toString('hex');
      return { nonce: nonceResponse.nonce, signature };
    };

    it('should verify a valid signature, return tokens and audit login_success', async () => {
      mockUserService.findByWalletAddress.mockResolvedValue(mockUser);
      const { nonce, signature } = await issueNonceAndSign();

      const result = await service.login({ walletAddress: wallet, nonce, signature });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'login_success' }),
      );
    });

    it('should auto-provision a user account on first wallet login', async () => {
      mockUserService.findByWalletAddress.mockResolvedValue(null);
      mockUserService.create.mockResolvedValue({ id: 'user-123' });
      mockUserService.findById.mockResolvedValue(mockUser);
      const { nonce, signature } = await issueNonceAndSign();

      await service.login({ walletAddress: wallet, nonce, signature });

      expect(mockUserService.create).toHaveBeenCalledWith(
        expect.objectContaining({ walletAddress: wallet.toLowerCase() }),
      );
    });

    it('should reject an invalid signature with 401 and audit login_failed', async () => {
      const { nonce } = await issueNonceAndSign();
      const wrongSignature = Buffer.from(keypair.sign(Buffer.from('tampered message', 'utf8'))).toString('hex');

      await expect(
        service.login({ walletAddress: wallet, nonce, signature: wrongSignature }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'login_failed' }),
      );
    });

    it('should consume the nonce after a failed attempt (replay protection)', async () => {
      const { nonce } = await issueNonceAndSign();
      const wrongSignature = Buffer.from(keypair.sign(Buffer.from('tampered', 'utf8'))).toString('hex');

      await expect(
        service.login({ walletAddress: wallet, nonce, signature: wrongSignature }),
      ).rejects.toThrow(UnauthorizedException);

      // Nonce must be gone after any verification attempt
      expect(mockRedisService.__store.has(`nonce:${wallet.toLowerCase()}`)).toBe(false);
    });

    it('should reject nonce reuse on a second login attempt (replay attack)', async () => {
      mockUserService.findByWalletAddress.mockResolvedValue(mockUser);
      const { nonce, signature } = await issueNonceAndSign();

      await service.login({ walletAddress: wallet, nonce, signature });

      await expect(service.login({ walletAddress: wallet, nonce, signature })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject login when no nonce was issued', async () => {
      await expect(
        service.login({
          walletAddress: wallet,
          nonce: 'unknown',
          signature: 'a'.repeat(128),
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject an expired nonce before signature verification', async () => {
      const { nonce } = await issueNonceAndSign();
      // Force expiry in the stored nonce payload
      const key = `nonce:${wallet.toLowerCase()}`;
      const stored = JSON.parse(mockRedisService.__store.get(key));
      stored.expiresAt = new Date(Date.now() - 1000).toISOString();
      mockRedisService.__store.set(key, JSON.stringify(stored));

      const signature = Buffer.from(keypair.sign(Buffer.from(nonce, 'utf8'))).toString('hex');
      await expect(
        service.login({ walletAddress: wallet, nonce, signature }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
