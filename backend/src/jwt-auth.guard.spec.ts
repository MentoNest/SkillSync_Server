import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockVerifyAsync = jest.fn();
const mockRedisGet = jest.fn();
const mockReflector = { getAllAndOverride: jest.fn() };

const mockJwtService = { verifyAsync: mockVerifyAsync };
const mockConfig = { get: jest.fn((key: string) => key === 'JWT_SECRET' ? 'test-secret' : undefined) };
const mockRedis = { getClient: jest.fn(() => ({ get: mockRedisGet })) };

const validPayload = { sub: 'user-1', wallet: 'G123', roles: [], permissions: [], jti: 'jti-abc', ver: 0 };

function makeContext(authHeader?: string, optional = false) {
  mockReflector.getAllAndOverride.mockReturnValue(optional);
  const req: any = { headers: authHeader ? { authorization: authHeader } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
    _req: req,
  };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new JwtAuthGuard(
      mockJwtService as any,
      mockConfig as any,
      mockRedis as any,
      mockReflector as any,
    );
  });

  it('allows valid, non-blacklisted token and attaches user', async () => {
    mockVerifyAsync.mockResolvedValue(validPayload);
    mockRedisGet.mockResolvedValue(null);

    const ctx = makeContext('Bearer valid.token.here');
    const result = await guard.canActivate(ctx as any);

    expect(result).toBe(true);
    expect(ctx._req.user).toEqual(validPayload);
  });

  it('throws 401 missing_token when no Authorization header', async () => {
    const ctx = makeContext();
    await expect(guard.canActivate(ctx as any)).rejects.toMatchObject({
      response: { code: 'missing_token' },
    });
  });

  it('throws 401 token_expired for expired token', async () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    mockVerifyAsync.mockRejectedValue(err);

    const ctx = makeContext('Bearer expired.token');
    await expect(guard.canActivate(ctx as any)).rejects.toMatchObject({
      response: { code: 'token_expired' },
    });
  });

  it('throws 401 invalid_token for malformed token', async () => {
    mockVerifyAsync.mockRejectedValue(new Error('invalid signature'));

    const ctx = makeContext('Bearer bad.token');
    await expect(guard.canActivate(ctx as any)).rejects.toMatchObject({
      response: { code: 'invalid_token' },
    });
  });

  it('throws 401 token_revoked for blacklisted token', async () => {
    mockVerifyAsync.mockResolvedValue(validPayload);
    mockRedisGet.mockResolvedValue('1');

    const ctx = makeContext('Bearer blacklisted.token');
    await expect(guard.canActivate(ctx as any)).rejects.toMatchObject({
      response: { code: 'token_revoked' },
    });
  });

  describe('optional mode', () => {
    it('returns true with no token in optional mode', async () => {
      const ctx = makeContext(undefined, true);
      expect(await guard.canActivate(ctx as any)).toBe(true);
      expect(ctx._req.user).toBeUndefined();
    });

    it('attaches user when valid token provided in optional mode', async () => {
      mockVerifyAsync.mockResolvedValue(validPayload);
      mockRedisGet.mockResolvedValue(null);

      const ctx = makeContext('Bearer valid.token', true);
      expect(await guard.canActivate(ctx as any)).toBe(true);
      expect(ctx._req.user).toEqual(validPayload);
    });

    it('returns true (not throws) for expired token in optional mode', async () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      mockVerifyAsync.mockRejectedValue(err);

      const ctx = makeContext('Bearer expired.token', true);
      expect(await guard.canActivate(ctx as any)).toBe(true);
    });

    it('returns true (not throws) for blacklisted token in optional mode', async () => {
      mockVerifyAsync.mockResolvedValue(validPayload);
      mockRedisGet.mockResolvedValue('1');

      const ctx = makeContext('Bearer blacklisted.token', true);
      expect(await guard.canActivate(ctx as any)).toBe(true);
    });
  });

  it('verifies token in under 5ms average', async () => {
    mockVerifyAsync.mockResolvedValue(validPayload);
    mockRedisGet.mockResolvedValue(null);

    const iterations = 50;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const ctx = makeContext('Bearer valid.token.here');
      await guard.canActivate(ctx as any);
    }
    const avgMs = (performance.now() - start) / iterations;
    expect(avgMs).toBeLessThan(5);
  });
});
