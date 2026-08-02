import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionRevokeService } from './services/session-revoke.service.js';
import { SuspiciousLoginService } from './services/suspicious-login.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    requestNonce: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  const mockSessionRevokeService = {
    revokeAllSessions: jest.fn(),
  };

  const mockSuspiciousLoginService = {
    recordFailedAttempt: jest.fn(),
    recordSuccessfulLogin: jest.fn(),
    getSuspiciousActivitySummary: jest.fn(),
  };

  const mockRequest = (ip?: string) => ({ ip }) as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: SessionRevokeService, useValue: mockSessionRevokeService },
        {
          provide: SuspiciousLoginService,
          useValue: mockSuspiciousLoginService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('refresh', () => {
    it('should forward the refresh token to the auth service', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
      });

      const result = await controller.refresh({
        refreshToken: 'raw-token',
      });

      expect(mockAuthService.refresh).toHaveBeenCalledWith('raw-token');
      expect(result).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
      });
    });
  });

  describe('login', () => {
    it('should block login when suspicious activity locks the account', async () => {
      mockSuspiciousLoginService.recordFailedAttempt.mockResolvedValue({
        isSuspicious: true,
        shouldLock: true,
      });

      await expect(
        controller.login(
          {
            walletAddress:
              'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
            nonce: 'sig',
          },
          mockRequest('127.0.0.1'),
        ),
      ).rejects.toThrow(
        'Account temporarily locked due to suspicious activity',
      );
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });

    it('should log in and record the successful attempt', async () => {
      mockSuspiciousLoginService.recordFailedAttempt.mockResolvedValue({
        isSuspicious: false,
        shouldLock: false,
      });
      mockAuthService.login.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
      });

      const result = await controller.login(
        {
          walletAddress:
            'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
          nonce: 'sig',
        },
        mockRequest('127.0.0.1'),
      );

      expect(mockAuthService.login).toHaveBeenCalledWith(
        'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
        'sig',
      );
      expect(
        mockSuspiciousLoginService.recordSuccessfulLogin,
      ).toHaveBeenCalledWith(
        'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
        '127.0.0.1',
      );
      expect(result).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
      });
    });
  });

  describe('logout', () => {
    it('should revoke the current access token and confirm', () => {
      const result = controller.logout({ user: { jti: 'jti-1' } });

      expect(mockAuthService.logout).toHaveBeenCalledWith('jti-1');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
