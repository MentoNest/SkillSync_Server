import { createCookieSecurityMiddleware } from '../cookie-security.middleware';
import { createRateLimitMiddleware } from '../rate-limit.middleware';

function makeRequest(path = '/auth/login', authorization?: string) {
  return {
    path,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: authorization ? { authorization } : {},
  };
}

function makeResponse() {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    statusCode: 200,
    body: undefined as unknown,
    setHeader: jest.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    cookie: jest.fn(),
  };
  return res;
}

describe('createRateLimitMiddleware', () => {
  const config = {
    enabled: true,
    windowMs: 60_000,
    authenticatedMax: 2,
    unauthenticatedMax: 1,
  };

  it('blocks anonymous callers after the stricter anonymous limit', () => {
    const middleware = createRateLimitMiddleware(config);
    const first = makeResponse();
    const second = makeResponse();

    middleware(makeRequest() as never, first as never, jest.fn());
    middleware(makeRequest() as never, second as never, jest.fn());

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(second.headers['Retry-After']).toBeDefined();
  });

  it('uses a separate, higher bucket for authenticated callers', () => {
    const middleware = createRateLimitMiddleware(config);
    const authHeader = 'Bearer token';
    middleware(
      makeRequest('/users', authHeader) as never,
      makeResponse() as never,
      jest.fn(),
    );
    middleware(
      makeRequest('/users', authHeader) as never,
      makeResponse() as never,
      jest.fn(),
    );
    const third = makeResponse();
    middleware(
      makeRequest('/users', authHeader) as never,
      third as never,
      jest.fn(),
    );

    expect(third.statusCode).toBe(429);
    expect(third.headers['X-RateLimit-Limit']).toBe('2');
  });

  it('uses a higher bucket for authenticated admin requests', () => {
    const middleware = createRateLimitMiddleware(config);
    const authHeader = 'Bearer token';
    const first = makeResponse();
    middleware(
      makeRequest('/admin/users', authHeader) as never,
      first as never,
      jest.fn(),
    );

    expect(first.statusCode).toBe(200);
    expect(first.headers['X-RateLimit-Limit']).toBe('20');

    for (let i = 0; i < 19; i += 1) {
      middleware(
        makeRequest('/admin/users', authHeader) as never,
        makeResponse() as never,
        jest.fn(),
      );
    }
    const denied = makeResponse();
    middleware(
      makeRequest('/admin/users', authHeader) as never,
      denied as never,
      jest.fn(),
    );
    expect(denied.statusCode).toBe(429);
  });

  it('does not throttle health checks or when disabled', () => {
    const middleware = createRateLimitMiddleware(config);
    for (let i = 0; i < 5; i += 1) {
      const res = makeResponse();
      middleware(makeRequest('/health') as never, res as never, jest.fn());
      expect(res.statusCode).toBe(200);
    }
    const disabled = createRateLimitMiddleware({ ...config, enabled: false });
    const res = makeResponse();
    disabled(makeRequest() as never, res as never, jest.fn());
    expect(res.statusCode).toBe(200);
  });
});

describe('createCookieSecurityMiddleware', () => {
  it('forces Secure, HttpOnly and SameSite on all cookies', () => {
    const middleware = createCookieSecurityMiddleware({
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
    });
    const res = makeResponse();
    const original = jest.fn();
    res.cookie.mockImplementation(original);

    middleware(makeRequest() as never, res as never, jest.fn());
    res.cookie('session', 'value', {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
    });

    expect(original).toHaveBeenCalledWith('session', 'value', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });
  });
});
