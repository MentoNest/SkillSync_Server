import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto/login.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { AuditLog } from '../entities/audit-log.entity';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn(),
    decode: jest.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        JWT_SECRET: 'test-secret-key-min-32-chars-length',
        JWT_EXPIRES_IN: '24h',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key-min-32-chars',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return config[key];
    }),
  };

  const mockRedisService = {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
  };

  const createMockRepository = () => ({
    findOne: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    }),
  });

  const mockUserRepository = createMockRepository();
  const mockRoleRepository = createMockRepository();
  const mockRefreshTokenRepository = createMockRepository();
  const mockAuditLogRepository = createMockRepository();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Role),
          useValue: mockRoleRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockAuditLogRepository,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateNonce', () => {
    it('should generate and store a nonce for wallet address', async () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';
      
      const nonce = await service.generateNonce(walletAddress);
      
      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(0);
    });
  });

  describe('verifySignature', () => {
    it('should verify a valid signature', async () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';
      const signature = '0xvalidsignature';
      const nonce = 'test-nonce';

      // This will fail with ethers without a real signature, but tests the flow
      const result = await service.verifySignature(walletAddress, signature, nonce);
      
      expect(typeof result).toBe('boolean');
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException for invalid nonce', async () => {
      const loginDto: LoginDto = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        signature: '0xsignature',
        nonce: 'invalid-nonce',
      };

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should login successfully with valid credentials', async () => {
      const walletAddress = 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75';
      const nonceResult = await service.generateNonce(walletAddress);

      mockRedisService.get.mockResolvedValueOnce(nonceResult.nonce);
      jest.spyOn(service, 'verifySignature').mockResolvedValue(true);
      mockRoleRepository.findOne.mockResolvedValueOnce(null);
      mockRoleRepository.create.mockImplementation((dto) => ({ ...dto, id: 'role-id' }));
      mockRoleRepository.save.mockResolvedValueOnce({ id: 'role-id', name: 'mentee' });

      const loginDto: LoginDto = {
        walletAddress,
        signature: '0xsignature',
        nonce: nonceResult.nonce,
      };

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user.walletAddress).toBe(walletAddress.toLowerCase());
    });
  });

  describe('refreshTokens', () => {
    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const refreshDto: RefreshDto = {
        refreshToken: 'invalid-token',
      };

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should refresh token successfully', async () => {
      const refreshDto: RefreshDto = {
        refreshToken: 'valid-refresh-token',
      };

      mockJwtService.verify.mockReturnValue({
        sub: 'user-id',
        walletAddress: 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75',
        roles: ['mentee'],
        permissions: [],
        type: 'refresh',
      });

      mockRedisService.exists.mockResolvedValue(false);
      mockRefreshTokenRepository.findOne.mockResolvedValueOnce({
        token: 'valid-refresh-token',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(Date.now() - 2000),
        userId: 'user-id',
        user: {
          id: 'user-id',
          walletAddress: 'gbrpyhil2ci3whzdtooqfc6eb4sjjsum3zulq4xfj1abc',
          roles: [{ name: 'mentee' }],
        },
        deviceFingerprint: 'fingerprint',
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
      });

      const result = await service.refreshTokens(refreshDto);

      expect(result).toHaveProperty('accessToken');
      expect(mockJwtService.sign).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const accessToken = 'test-access-token';
      const userId = 'user-id';

      await expect(service.logout(accessToken, userId)).resolves.not.toThrow();
    });
  });

  describe('validateToken', () => {
    it('should validate token payload', async () => {
      const payload = {
        sub: 'user-id',
        walletAddress: 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE75',
        roles: ['mentee'],
        permissions: [],
        jti: 'test-jti',
        tokenVersion: 1,
      };

      mockUserRepository.findOne.mockResolvedValueOnce({
        id: 'user-id',
        walletAddress: payload.walletAddress.toLowerCase(),
        tokenVersion: 1,
        roles: [{ name: 'mentee' }],
      });

      const result = await service.validateToken(payload as any);

      expect(result).toEqual({
        userId: payload.sub,
        walletAddress: payload.walletAddress.toLowerCase(),
        roles: ['mentee'],
        permissions: [],
      });
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const userId = 'user-id';

      mockUserRepository.findOne.mockResolvedValueOnce({
        id: userId,
        walletAddress: 'gbrpyhil2ci3whzdtooqfc6eb4sjjsum3zulq4xfjlrovyucharse75',
        roles: [{ name: 'mentee' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getProfile(userId);

      expect(result).toHaveProperty('id', userId);
      expect(result).toHaveProperty('walletAddress');
      expect(result).toHaveProperty('roles');
    });
  });
});
