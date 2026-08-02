import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { WalletStrategy } from './strategies/wallet.strategy.js';
import { TokenBlacklistService } from './services/token-blacklist.service.js';
import { v4 as uuidv4 } from 'uuid';

jest.mock('uuid', () => {
  let mockUuidCounter = 0;
  return { v4: jest.fn(() => `uuid-${++mockUuidCounter}`) };
});

describe('AuthService', () => {
  let service: AuthService;

  const mockWalletStrategy = {
    generateNonce: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, fallback?: unknown) => fallback),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockTokenBlacklistService = {
    blacklist: jest.fn(),
    isBlacklisted: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: WalletStrategy, useValue: mockWalletStrategy },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklistService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestNonce', () => {
    it('should return a nonce and expiry', () => {
      mockWalletStrategy.generateNonce.mockReturnValue({
        nonce: 'nonce-1',
        expiresAt: Date.now() + 60_000,
      });

      const result = service.requestNonce('GABC');
      expect(result).toHaveProperty('nonce');
      expect(result).toHaveProperty('expiresAt');
    });
  });

  describe('login', () => {
    it('should issue an access and refresh token pair for a valid signature', async () => {
      mockWalletStrategy.generateNonce.mockReturnValue({
        nonce: 'nonce-1',
        expiresAt: Date.now() + 60_000,
      });
      service.requestNonce('test-wallet');

      mockWalletStrategy.verify.mockReturnValue(true);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.login('test-wallet', 'nonce-1');

      expect(mockWalletStrategy.verify).toHaveBeenCalledWith(
        'test-wallet',
        'nonce-1',
        'nonce-1',
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      });
    });

    it('should throw UnauthorizedException when no nonce was requested', async () => {
      await expect(
        service.login('unknown-wallet', 'some-signature'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when the signature is invalid', async () => {
      mockWalletStrategy.generateNonce.mockReturnValue({
        nonce: 'nonce-1',
        expiresAt: Date.now() + 60_000,
      });
      service.requestNonce('test-wallet');
      mockWalletStrategy.verify.mockReturnValue(false);

      await expect(service.login('test-wallet', 'nonce-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('should rotate the refresh token and issue a new access token pair', async () => {
      mockWalletStrategy.generateNonce.mockReturnValue({
        nonce: 'nonce-1',
        expiresAt: Date.now() + 60_000,
      });
      service.requestNonce('test-wallet');
      mockWalletStrategy.verify.mockReturnValue(true);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('old-refresh-token');
      const { refreshToken } = await service.login('test-wallet', 'nonce-1');
      const issuedRefreshJti = (uuidv4 as jest.Mock).mock.results.at(-1)
        ?.value as string;

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'test-wallet',
        jti: issuedRefreshJti,
        type: 'refresh',
      });
      mockJwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await service.refresh(refreshToken);

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 900,
      });
    });

    it('should reject an invalid or expired refresh token', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('bad token'));

      await expect(service.refresh('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should blacklist the access token jti for its remaining lifetime', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);

      await service.logout('access-jti', nowSeconds + 120);

      expect(mockTokenBlacklistService.blacklist).toHaveBeenCalledWith(
        'access-jti',
        expect.any(Number),
      );
      const [, ttl] = mockTokenBlacklistService.blacklist.mock.calls[0] as [
        string,
        number,
      ];
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(120);
    });

    it('should fall back to the configured access TTL when no expiry is given', async () => {
      await service.logout('access-jti');

      expect(mockTokenBlacklistService.blacklist).toHaveBeenCalledWith(
        'access-jti',
        900,
      );
    });

    it('isTokenRevoked should return true after logout', async () => {
      await service.logout('jti-abc');
      expect(service.isTokenRevoked('jti-abc')).toBe(true);
    });

    it('should mark a stored refresh token as revoked', async () => {
      mockWalletStrategy.generateNonce.mockReturnValue({
        nonce: 'nonce-1',
        expiresAt: Date.now() + 60_000,
      });
      service.requestNonce('test-wallet');
      mockWalletStrategy.verify.mockReturnValue(true);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      await service.login('test-wallet', 'nonce-1');
      const issuedRefreshJti = (uuidv4 as jest.Mock).mock.results.at(-1)
        ?.value as string;

      await service.logout('access-jti', undefined, issuedRefreshJti);

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'test-wallet',
        jti: issuedRefreshJti,
        type: 'refresh',
      });
      await expect(service.refresh('refresh-token')).rejects.toThrow(
        'Refresh token has been revoked',
      );
    });
  });
});
