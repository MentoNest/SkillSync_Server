import { ThrottlerGuard } from './throttler.guard.js';

describe('ThrottlerGuard production limits', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalTrustedIps = process.env.TRUSTED_IPS;
  let guard: ThrottlerGuard;
  let checkRateLimit: ReturnType<typeof vi.fn>;
  let throttleOverride: { limit: number; ttl: number } | undefined;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.TRUSTED_IPS = '192.0.2.10';
    throttleOverride = undefined;
    checkRateLimit = vi.fn().mockResolvedValue({
      isLimited: false,
      currentCount: 0,
      retryAfter: 0,
    });
    guard = new ThrottlerGuard(
      { getAllAndOverride: () => throttleOverride } as any,
      { checkRateLimit } as any,
    );
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalTrustedIps === undefined) delete process.env.TRUSTED_IPS;
    else process.env.TRUSTED_IPS = originalTrustedIps;
  });

  function context(user?: { id: string }, ip = '192.0.2.10') {
    const response = { setHeader: vi.fn() };
    return {
      context: {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-forwarded-for': '198.51.100.99' },
            ip,
            method: 'GET',
            path: '/api/v1/profile',
            user,
          }),
          getResponse: () => response,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any,
      response,
    };
  }

  it('limits unauthenticated production requests to 10 per minute', async () => {
    const { context: requestContext } = context();
    await expect(guard.canActivate(requestContext)).resolves.toBe(true);
    expect(checkRateLimit.mock.calls[0][1]).toBe(10);
    expect(checkRateLimit.mock.calls[0][2]).toBe(60);
  });

  it('limits authenticated production requests to 50 per minute', async () => {
    const { context: requestContext } = context({ id: 'user-123' }, '198.51.100.10');
    await expect(guard.canActivate(requestContext)).resolves.toBe(true);
    expect(checkRateLimit.mock.calls[0][1]).toBe(50);
  });

  it('caps route-specific overrides and does not bypass trusted IPs in production', async () => {
    throttleOverride = { limit: 500, ttl: 60 };
    guard = new ThrottlerGuard(
      { getAllAndOverride: () => throttleOverride } as any,
      { checkRateLimit } as any,
    );
    const { context: requestContext } = context();

    await expect(guard.canActivate(requestContext)).resolves.toBe(true);
    expect(checkRateLimit.mock.calls[0][1]).toBe(10);
  });
});