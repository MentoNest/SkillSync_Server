import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SuspiciousDetectionService } from './services/suspicious-detection.service';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Role } from '../entities/role.entity';
import { RedisService } from './services/redis.service';

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
        expiresIn: 86400,
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

  describe('revokeAll', () => {
    it('should call authService.revokeAll with user id', async () => {
      const mockUser: any = { id: 'user-123' };
      const result = await controller.revokeAll(mockUser, '127.0.0.1', 'test-agent');
      expect(result.revokedSessionsCount).toBe(3);
      expect(mockAuthService.revokeAll).toHaveBeenCalledWith('user-123', '127.0.0.1', 'test-agent');
    });
  });
});
