import { HttpException, HttpStatus } from '@nestjs/common';
import { Keypair } from 'stellar-sdk';
import { AuthController } from './auth.controller';
import { RedisService } from './redis/redis.service';

const validStellarAddress = Keypair.random().publicKey();

describe('AuthController', () => {
  let controller: AuthController;
  let redisService: jest.Mocked<Pick<RedisService, 'set' | 'get' | 'del' | 'getClient'>>;
  let authService: { blacklistToken: jest.Mock; incrementTokenVersion: jest.Mock };
  let refreshTokenService: { revokeAllUserTokens: jest.Mock };
  let auditLogService: { logEvent: jest.Mock; logAttempt: jest.Mock };

  beforeEach(() => {
    redisService = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      getClient: jest.fn(),
    };
    authService = {
      blacklistToken: jest.fn().mockResolvedValue(undefined),
      incrementTokenVersion: jest.fn().mockResolvedValue(1),
    };
    refreshTokenService = {
      revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
    };
    auditLogService = {
      logEvent: jest.fn().mockResolvedValue(undefined),
      logAttempt: jest.fn().mockResolvedValue(undefined),
    };

    controller = new AuthController(
      redisService as unknown as RedisService,
      authService as any,
      undefined as any, // userService
      undefined as any, // loginAttemptService
      auditLogService as any,
      undefined as any, // suspiciousLoginService
      refreshTokenService as any,
      undefined as any, // suspiciousActivityService
    );
  });

  it('returns a nonce and expiresAt for a valid Stellar wallet address', async () => {
    const result = await controller.getNonce(validStellarAddress);

    expect(typeof result.nonce).toBe('string');
    expect(result.nonce).toHaveLength(64);
    expect(result.nonce).toMatch(/^[0-9a-f]+$/);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(redisService.set).toHaveBeenCalledWith(
      validStellarAddress,
      result.nonce,
      300,
      'nonce',
    );
  });

  it('throws BAD_REQUEST for an invalid Stellar wallet address', async () => {
    await expect(controller.getNonce('invalid-address')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('normalizes lowercase wallet address to uppercase', async () => {
    const result = await controller.getNonce(validStellarAddress.toLowerCase());
    expect(redisService.set).toHaveBeenCalledWith(
      validStellarAddress,
      result.nonce,
      300,
      'nonce',
    );
  });

  describe('logout', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const mockReq = {
      user: { sub: 'user-1', jti: 'jti-abc', exp, wallet: 'G123', roles: [], permissions: [], ver: 0 },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    };

    it('blacklists jti with remaining TTL and revokes refresh tokens', async () => {
      const result = await controller.logout(mockReq as any);

      expect(authService.blacklistToken).toHaveBeenCalledWith('jti-abc', expect.any(Number));
      const ttlArg = (authService.blacklistToken as jest.Mock).mock.calls[0][1];
      expect(ttlArg).toBeGreaterThan(0);
      expect(ttlArg).toBeLessThanOrEqual(600);

      expect(refreshTokenService.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
      expect(auditLogService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', details: expect.objectContaining({ action: 'logout' }) }),
      );
      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('uses fallback TTL of 900 when exp missing', async () => {
      const req = { ...mockReq, user: { ...mockReq.user, exp: undefined } };
      await controller.logout(req as any);
      expect(authService.blacklistToken).toHaveBeenCalledWith('jti-abc', 900);
    });
  });

  describe('logoutAll', () => {
    const mockReq = {
      user: { sub: 'user-1', jti: 'jti-abc', exp: Math.floor(Date.now() / 1000) + 600, wallet: 'G123', roles: [], permissions: [], ver: 0 },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    };

    it('increments token version and revokes all refresh tokens', async () => {
      const result = await controller.logoutAll(mockReq as any);

      expect(authService.incrementTokenVersion).toHaveBeenCalledWith('user-1');
      expect(refreshTokenService.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
      expect(auditLogService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', details: expect.objectContaining({ action: 'logout_all' }) }),
      );
      expect(result).toEqual({ message: 'All sessions invalidated' });
    });
  });
});
