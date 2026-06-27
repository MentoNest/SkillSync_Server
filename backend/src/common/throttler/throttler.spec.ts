import { ThrottlerService } from './throttler.service';

const mockMulti = {
  zremrangebyscore: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

const mockClient = {
  multi: jest.fn(() => mockMulti),
  zrange: jest.fn(),
};

const mockRedisService = { getClient: jest.fn(() => mockClient) };

describe('ThrottlerService', () => {
  let service: ThrottlerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ThrottlerService(mockRedisService as any);
  });

  it('allows request when under limit', async () => {
    // zremrangebyscore returns 0, zcard returns 2 (below limit of 5)
    mockMulti.exec.mockResolvedValueOnce([[null, 0], [null, 2]]);
    mockMulti.exec.mockResolvedValueOnce([[null, 'OK'], [null, 1]]);

    const result = await service.check('test-key', 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBe(0);
  });

  it('blocks request when at limit', async () => {
    mockMulti.exec.mockResolvedValueOnce([[null, 0], [null, 5]]);
    mockClient.zrange.mockResolvedValue([`${Date.now() - 30000}`, `${Date.now() - 30000}`]);

    const result = await service.check('test-key', 5, 60);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('returns retryAfter >= 1 when blocked', async () => {
    const oldTs = Date.now() - 59_000; // 59s ago, so ~1s remaining
    mockMulti.exec.mockResolvedValueOnce([[null, 0], [null, 10]]);
    mockClient.zrange.mockResolvedValue([String(oldTs), String(oldTs)]);

    const result = await service.check('test-key', 10, 60);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });
});

describe('ThrottlerGuard', () => {
  const { ThrottlerGuard } = require('./throttler.guard');
  const { Reflector } = require('@nestjs/core');

  const mockReflector = { getAllAndOverride: jest.fn() };
  const mockThrottlerService = { check: jest.fn() };

  let guard: typeof ThrottlerGuard.prototype;

  const makeContext = (overrides: {
    user?: any;
    ip?: string;
    headers?: Record<string, string>;
    setHeader?: jest.Mock;
  } = {}) => {
    const res = { setHeader: overrides.setHeader ?? jest.fn() };
    const req = {
      user: overrides.user,
      socket: { remoteAddress: overrides.ip ?? '127.0.0.1' },
      headers: overrides.headers ?? {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
      getHandler: () => ({ name: 'testHandler' }),
      getClass: () => ({ name: 'TestController' }),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no THROTTLE_TRUSTED_IPS env
    delete process.env.THROTTLE_TRUSTED_IPS;
    guard = new ThrottlerGuard(mockReflector as any, mockThrottlerService as any);
  });

  it('skips throttling when meta is null (@SkipThrottle)', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(null);
    const result = await guard.canActivate(makeContext());
    expect(result).toBe(true);
    expect(mockThrottlerService.check).not.toHaveBeenCalled();
  });

  it('allows request when under limit', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({ limit: 10, ttl: 60 });
    mockThrottlerService.check.mockResolvedValue({ allowed: true, retryAfter: 0 });
    const result = await guard.canActivate(makeContext());
    expect(result).toBe(true);
  });

  it('throws 429 when over limit and sets Retry-After header', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({ limit: 5, ttl: 60 });
    mockThrottlerService.check.mockResolvedValue({ allowed: false, retryAfter: 42 });
    const setHeader = jest.fn();
    await expect(guard.canActivate(makeContext({ setHeader }))).rejects.toMatchObject({
      response: { statusCode: 429 },
    });
    expect(setHeader).toHaveBeenCalledWith('Retry-After', 42);
  });

  it('uses userId as identifier for authenticated requests', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({ limit: 100, ttl: 60 });
    mockThrottlerService.check.mockResolvedValue({ allowed: true, retryAfter: 0 });
    await guard.canActivate(makeContext({ user: { sub: 'user-123' } }));
    expect(mockThrottlerService.check).toHaveBeenCalledWith(
      expect.stringContaining('user:user-123'),
      100,
      60,
    );
  });

  it('uses IP as identifier for unauthenticated requests', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({ limit: 20, ttl: 60 });
    mockThrottlerService.check.mockResolvedValue({ allowed: true, retryAfter: 0 });
    await guard.canActivate(makeContext({ ip: '192.168.1.1' }));
    expect(mockThrottlerService.check).toHaveBeenCalledWith(
      expect.stringContaining('ip:192.168.1.1'),
      20,
      60,
    );
  });

  it('bypasses throttle for trusted IPs', async () => {
    process.env.THROTTLE_TRUSTED_IPS = '10.0.0.1,10.0.0.2';
    guard = new ThrottlerGuard(mockReflector as any, mockThrottlerService as any);
    mockReflector.getAllAndOverride.mockReturnValue({ limit: 5, ttl: 60 });
    const result = await guard.canActivate(makeContext({ ip: '10.0.0.1' }));
    expect(result).toBe(true);
    expect(mockThrottlerService.check).not.toHaveBeenCalled();
  });

  it('respects X-Forwarded-For header', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({ limit: 20, ttl: 60 });
    mockThrottlerService.check.mockResolvedValue({ allowed: true, retryAfter: 0 });
    await guard.canActivate(makeContext({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' } }));
    expect(mockThrottlerService.check).toHaveBeenCalledWith(
      expect.stringContaining('ip:203.0.113.5'),
      20,
      60,
    );
  });

  it('uses default unauthenticated limit when no meta decorator', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    mockThrottlerService.check.mockResolvedValue({ allowed: true, retryAfter: 0 });
    await guard.canActivate(makeContext());
    expect(mockThrottlerService.check).toHaveBeenCalledWith(expect.any(String), 20, 60);
  });

  it('uses default authenticated limit when no meta decorator', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    mockThrottlerService.check.mockResolvedValue({ allowed: true, retryAfter: 0 });
    await guard.canActivate(makeContext({ user: { sub: 'user-abc' } }));
    expect(mockThrottlerService.check).toHaveBeenCalledWith(expect.any(String), 100, 60);
  });
});
