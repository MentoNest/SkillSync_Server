import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SuspiciousDetectionService } from './services/suspicious-detection.service.js';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity.js';
import { UserSuspension } from '../user/entities/user-suspension.entity.js';
import { Role } from '../entities/role.entity.js';
import { RedisService } from './services/redis.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: any;
  let mockSuspiciousDetectionService: any;

  beforeEach(async () => {
    mockAuthService = {
      generateNonce: jest.fn().mockResolvedValue({
        walletAddress: 'ga7qynf7sowq3glr2bgmzehxavirza4kvwltjjfc7mgxua74p7ujvsgz',
        nonce: 'challenge-123',
        expiresAt: new Date(Date.now() + 300_000),
      }),
      login: jest.fn().mockResolvedValue({
        accessToken: 'token-abc',
        refreshToken: 'refresh-xyz',
        tokenType: 'Bearer',
        expiresIn: 86400,
      }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new-token-abc',
        refreshToken: 'refresh-xyz',
        expiresIn: 86400,
        refreshExpiresIn: 2592000,
      }),
      logout: jest.fn().mockResolvedValue({ success: true, message: 'Logged out' }),
      revokeAll: jest.fn().mockResolvedValue({
        success: true,
        message: 'All sessions revoked',
        revokedSessionsCount: 3,
        tokenVersion: 2,
      }),
      adminRevokeAll: jest.fn().mockResolvedValue({
        success: true,
        message: 'All sessions revoked for user',
        revokedSessionsCount: 2,
        tokenVersion: 3,
      }),
    };

    mockSuspiciousDetectionService = {
      getSuspiciousActivityDashboard: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: SuspiciousDetectionService, useValue: mockSuspiciousDetectionService },
        { provide: JwtService, useValue: {} },
        { provide: RedisService, useValue: { incr: jest.fn().mockResolvedValue(1), expire: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Role), useValue: {} },
        { provide: getRepositoryToken(UserSuspension), useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getNonce', () => {
    it('should return nonce challenge with expiry', async () => {
      const result = await controller.getNonce('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ');
      expect(result.nonce).toBe('challenge-123');
      expect(result.expiresAt).toBeDefined();
      expect(mockAuthService.generateNonce).toHaveBeenCalledWith(
        'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
      );
    });
  });

  describe('auth cookies', () => {
    it('sets secure access and refresh cookies on login', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const response = { cookie: jest.fn() } as any;

      try {
        const result = await controller.login({} as any, '192.0.2.1', response);

        expect(result.accessToken).toBe('token-abc');
        expect(response.cookie).toHaveBeenNthCalledWith(
          1,
          'accessToken',
          'token-abc',
          expect.objectContaining({
            secure: true,
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 86400 * 1000,
          }),
        );
        expect(response.cookie).toHaveBeenNthCalledWith(
          2,
          'refreshToken',
          'refresh-xyz',
          expect.objectContaining({
            secure: true,
            httpOnly: true,
            sameSite: 'strict',
          }),
        );
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
    });

    it('rotates secure cookies on refresh', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const response = { cookie: jest.fn() } as any;

      try {
        const result = await controller.refresh(
          { refreshToken: 'old-refresh' } as any,
          '192.0.2.1',
          response,
        );

        expect(result.accessToken).toBe('new-token-abc');
        expect(response.cookie).toHaveBeenCalledTimes(2);
        expect(response.cookie).toHaveBeenCalledWith(
          'refreshToken',
          'refresh-xyz',
          expect.objectContaining({ secure: true, httpOnly: true, sameSite: 'strict' }),
        );
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
    });
  });

  describe('revokeAll', () => {
    it('should call authService.revokeAll with user id', async () => {
      const mockUser: any = { id: 'user-123' };
      const result = await controller.revokeAll(mockUser, '127.0.0.1', 'test-agent');
      expect(result.revokedSessionsCount).toBe(3);
      expect(mockAuthService.revokeAll).toHaveBeenCalledWith('user-123', '127.0.0.1', 'test-agent');
    });
  });
});
