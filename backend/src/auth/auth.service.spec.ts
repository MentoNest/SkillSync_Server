import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';

describe('AuthService', () => {
  let service: AuthService;

  const mockRefreshTokenService = {
    rotate: jest.fn(),
  };

  const mockUsersService = {
    findById: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
  };

  const deviceInfo = { userAgent: 'jest', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: RefreshTokenService, useValue: mockRefreshTokenService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('refresh', () => {
    it('should rotate the refresh token and issue a new access token pair', async () => {
      const expiresAt = new Date();
      mockRefreshTokenService.rotate.mockResolvedValue({
        token: 'new-refresh-token',
        expiresAt,
        userId: 'user-1',
      });
      mockUsersService.findById.mockResolvedValue({
        id: 'user-1',
        walletAddress: 'test-wallet',
        roles: [{ name: AuthRole.MENTEE }],
      });
      mockJwtService.signAsync.mockResolvedValue('new-access-token');

      const result = await service.refresh('old-refresh-token', deviceInfo);

      expect(mockRefreshTokenService.rotate).toHaveBeenCalledWith(
        'old-refresh-token',
        deviceInfo,
      );
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-1',
          wallet: 'test-wallet',
          roles: [AuthRole.MENTEE],
        }),
      );
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        refreshTokenExpiresAt: expiresAt,
      });
    });

    it('should propagate errors from an invalid or reused refresh token', async () => {
      mockRefreshTokenService.rotate.mockRejectedValue(new Error('invalid'));

      await expect(service.refresh('bad-token', deviceInfo)).rejects.toThrow(
        'invalid',
      );
    });
  });
});
