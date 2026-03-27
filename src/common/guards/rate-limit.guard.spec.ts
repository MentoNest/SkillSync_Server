import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from '../cache/rate-limit.service';

function makeContext(ip = '127.0.0.1') {
  const req: any = {
    ip,
    connection: { remoteAddress: ip },
    socket: { remoteAddress: ip },
    headers: {},
    body: {},
    user: { id: 'user-1' },
  };
  const res: any = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };

  const handler = jest.fn();

  const context: any = {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  };

  return { req, res, handler, context };
}

describe('RateLimitGuard', () => {
  it('allows when skip condition is true', async () => {
    const reflector = { get: jest.fn().mockImplementation((key: string) => {
      if (key === 'rateLimitSkip') return () => true;
      return undefined;
    }) } as unknown as Reflector;

    const rateLimitService = { isAllowed: jest.fn() } as unknown as RateLimitService;
    const guard = new RateLimitGuard(rateLimitService, reflector);

    const { context } = makeContext();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(reflector.get).toHaveBeenCalledWith('rateLimitSkip', expect.anything());
  });

  it('allows when under limit and sets headers', async () => {
    const reflector = { get: jest.fn().mockImplementation((key: string) => {
      if (key === 'rateLimitOptions') return { windowMs: 60000, max: 100, keyPrefix: 'normal' };
      return undefined;
    }) } as unknown as Reflector;

    const rateLimitService = {
      isAllowed: jest.fn().mockResolvedValue({ allowed: true, remaining: 99, resetTime: Date.now() + 60000, current: 1 }),
    } as unknown as RateLimitService;

    const guard = new RateLimitGuard(rateLimitService, reflector);
    const { context, res } = makeContext('1.2.3.4');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(rateLimitService.isAllowed).toHaveBeenCalledWith('ip:1.2.3.4', expect.objectContaining({ max: 100 }));
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
  });

  it('throws TooManyRequestsException when over limit', async () => {
    const reflector = { get: jest.fn().mockImplementation((key: string) => {
      if (key === 'rateLimitOptions') return { windowMs: 60000, max: 1, keyPrefix: 'strict' };
      return undefined;
    }) } as unknown as Reflector;

    const rateLimitService = {
      isAllowed: jest.fn().mockResolvedValue({ allowed: false, remaining: 0, resetTime: Date.now() + 30000, current: 2 }),
    } as unknown as RateLimitService;

    const guard = new RateLimitGuard(rateLimitService, reflector);
    const { context, res } = makeContext('1.2.3.4');

    const invocation = guard.canActivate(context);
    await expect(invocation).rejects.toThrow(HttpException);
    await expect(invocation).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});
