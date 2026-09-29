import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { JwtAuthGuard } from './jwt-auth.guard.js';
import {
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
} from '../decorators/optional-auth.decorator.js';
import { RedisService } from '../services/redis.service.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let mockReflector: any;
  let mockJwtService: any;
  let mockRedisService: any;
  let mockMetricsService: any;

  const VALID_TOKEN = 'valid.jwt.token';
  const PAYLOAD = {
    sub: 'user-123',
    walletAddress: 'ga53rlwvn3haiyzx2rd3xw4lyhpce4jc2hl4yvprvkcdxhdu2oawt2gi',
    roles: ['mentor'],
  };
  const buildContext = (
    headers: Record<string, string>,
    requestOverrides: Record<string, unknown> = {},
  ) => {
    const request: any = { headers, ...requestOverrides };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as any;
  };

  /** Reads the `code` field the guard attaches to its 401 payloads. */
  const codeOf = async (
    promise: Promise<unknown>,
  ): Promise<string | undefined> => {
    try {
      await promise;
      throw new Error('expected the guard to reject');
    } catch (err: any) {
      return err?.response?.code;
    }
  };

  beforeEach(() => {
    mockReflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    mockJwtService = { verifyAsync: jest.fn().mockResolvedValue(PAYLOAD) };
    mockRedisService = {
      isTokenBlacklisted: jest.fn().mockResolvedValue(false),
    };
    mockMetricsService = { incrementJwtFailures: jest.fn() };

    guard = new JwtAuthGuard(
      mockReflector as Reflector,
      mockJwtService as JwtService,
      mockRedisService as RedisService,
      undefined,
      mockMetricsService,
    );
  });

  describe('valid tokens', () => {
    it('allows the request and attaches the decoded payload to req.user', async () => {
      const ctx = buildContext({ authorization: `Bearer ${VALID_TOKEN}` });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      const request = ctx.switchToHttp().getRequest();
      expect(request.user).toEqual(PAYLOAD);
      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(VALID_TOKEN);
    });

    it('accepts a lowercase bearer scheme', async () => {
      const ctx = buildContext({ authorization: `bearer ${VALID_TOKEN}` });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });

  describe('missing tokens', () => {
    it('rejects with 401 and token_missing when the header is absent', async () => {
      const ctx = buildContext({});

      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(await codeOf(guard.canActivate(ctx))).toBe('token_missing');
    });

    it('rejects a malformed authorization header with invalid_token', async () => {
      const ctx = buildContext({ authorization: VALID_TOKEN });

      expect(await codeOf(guard.canActivate(ctx))).toBe('invalid_token');
    });

    it('rejects a non-bearer scheme', async () => {
      const ctx = buildContext({ authorization: `Basic ${VALID_TOKEN}` });
      expect(await codeOf(guard.canActivate(ctx))).toBe('invalid_token');
    });
  });

  describe('expired tokens', () => {
    beforeEach(() => {
      const expired = Object.assign(new Error('jwt expired'), {
        name: 'TokenExpiredError',
      });
      mockJwtService.verifyAsync.mockRejectedValue(expired);
    });

    it('rejects with 401 and token_expired', async () => {
      const ctx = buildContext({ authorization: `Bearer ${VALID_TOKEN}` });

      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(await codeOf(guard.canActivate(ctx))).toBe('token_expired');
    });

    it('does not leak a req.user payload', async () => {
      const ctx = buildContext({ authorization: `Bearer ${VALID_TOKEN}` });
      await guard.canActivate(ctx).catch(() => undefined);
      expect(ctx.switchToHttp().getRequest().user).toBeUndefined();
    });
  });

  describe('invalid tokens', () => {
    beforeEach(() => {
      mockJwtService.verifyAsync.mockRejectedValue(
        new Error('invalid signature'),
      );
    });

    it('rejects with 401 and invalid_token', async () => {
      const ctx = buildContext({ authorization: `Bearer ${VALID_TOKEN}` });
      expect(await codeOf(guard.canActivate(ctx))).toBe('invalid_token');
      expect(mockMetricsService.incrementJwtFailures).toHaveBeenCalledWith(
        'invalid',
      );
    });
  });

  describe('blacklisted tokens', () => {
    beforeEach(() => {
      mockRedisService.isTokenBlacklisted.mockResolvedValue(true);
    });

    it('rejects with 401 and token_revoked', async () => {
      const ctx = buildContext({ authorization: `Bearer ${VALID_TOKEN}` });

      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(await codeOf(guard.canActivate(ctx))).toBe('token_revoked');
    });

    it('does not attempt verification for an already-revoked token', async () => {
      const ctx = buildContext({ authorization: `Bearer ${VALID_TOKEN}` });
      await guard.canActivate(ctx).catch(() => undefined);
      expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
    });
  });

  describe('@Public()', () => {
    it('short-circuits without touching the token or the blacklist', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) =>
        key === IS_PUBLIC_KEY ? true : undefined,
      );
      const ctx = buildContext({});

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
      expect(mockRedisService.isTokenBlacklisted).not.toHaveBeenCalled();
    });
  });

  describe('optional authentication', () => {
    it('passes through with a null user when no token is supplied', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) =>
        key === IS_OPTIONAL_AUTH_KEY ? true : undefined,
      );
      const ctx = buildContext({});

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(ctx.switchToHttp().getRequest().user).toBeNull();
    });

    it('passes through with a null user when the token is invalid', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) =>
        key === IS_OPTIONAL_AUTH_KEY ? true : undefined,
      );
      mockJwtService.verifyAsync.mockRejectedValue(
        new Error('invalid signature'),
      );
      const ctx = buildContext({ authorization: `Bearer ${VALID_TOKEN}` });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(ctx.switchToHttp().getRequest().user).toBeNull();
    });

    it('still attaches the payload when a valid token is supplied', async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) =>
        key === IS_OPTIONAL_AUTH_KEY ? true : undefined,
      );
      const ctx = buildContext({ authorization: `Bearer ${VALID_TOKEN}` });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(ctx.switchToHttp().getRequest().user).toEqual(PAYLOAD);
    });

    it('honours the optional:true constructor option', async () => {
      const optionalGuard = new JwtAuthGuard(
        mockReflector as Reflector,
        mockJwtService as JwtService,
        mockRedisService as RedisService,
        { optional: true },
      );
      const ctx = buildContext({});

      await expect(optionalGuard.canActivate(ctx)).resolves.toBe(true);
    });
  });

  describe('performance', () => {
    it('verifies tokens in well under 5ms on average', async () => {
      const ctx = buildContext({ authorization: `Bearer ${VALID_TOKEN}` });
      const iterations = 500;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        await guard.canActivate(ctx);
      }
      const perCallMs = (performance.now() - start) / iterations;

      expect(perCallMs).toBeLessThan(5);
    });
  });
});
