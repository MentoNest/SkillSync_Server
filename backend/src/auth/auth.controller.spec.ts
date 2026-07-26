import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    refresh: jest.fn(),
  };

  const mockRequest = (userAgent?: string, ip?: string) =>
    ({
      headers: userAgent ? { 'user-agent': userAgent } : {},
      ip,
    }) as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('refresh', () => {
    it('should forward the refresh token and device info to the auth service', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        refreshTokenExpiresAt: new Date(),
      });

      await controller.refresh(
        { refreshToken: 'raw-token' },
        mockRequest('jest-agent', '127.0.0.1'),
      );

      expect(mockAuthService.refresh).toHaveBeenCalledWith('raw-token', {
        userAgent: 'jest-agent',
        ipAddress: '127.0.0.1',
      });
    });
  });
});
