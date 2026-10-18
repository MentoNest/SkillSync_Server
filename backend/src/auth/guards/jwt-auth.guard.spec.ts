import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, JwtAuthGuard, Public } from './jwt-auth.guard';

function createContext(headers: Record<string, string> = {}) {
  const req = { headers } as never;
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => req }),
    req,
  } as const;
}

function createGuard(options: { isPublic?: boolean; payload?: unknown; rejects?: Error } = {}) {
  const strategy = {
    validate: jest.fn().mockImplementation(() => {
      if (options.rejects) return Promise.reject(options.rejects);
      return Promise.resolve(options.payload ?? { sub: 'u1' });
    }),
  };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(options.isPublic ?? false),
  } as unknown as Reflector;
  const guard = new JwtAuthGuard(strategy as never, reflector);
  return { guard, strategy, reflector };
}

describe('JwtAuthGuard', () => {
  it('exposes the public metadata key', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic');
    expect(typeof Public()).toBe('object');
  });

  it('allows public routes without a token', async () => {
    const { guard, strategy } = createGuard({ isPublic: true });
    const ctx = createContext();
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(strategy.validate).not.toHaveBeenCalled();
  });

  it('rejects a request without a bearer token', async () => {
    const { guard } = createGuard();
    const ctx = createContext();
    await expect(guard.canActivate(ctx as never)).rejects.toThrow('Missing bearer token');
  });

  it('rejects a non-bearer authorization header', async () => {
    const { guard } = createGuard();
    const ctx = createContext({ authorization: 'Basic dXNlcjpwYXNz' });
    await expect(guard.canActivate(ctx as never)).rejects.toThrow('Missing bearer token');
  });

  it('attaches the verified payload to the request', async () => {
    const payload = { sub: 'u1', wallet: 'W', roles: [], permissions: [], jti: 'j', iat: 1, exp: 2 };
    const { guard } = createGuard({ payload });
    const ctx = createContext({ authorization: 'Bearer token' });
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(ctx.req).toHaveProperty('user', payload);
  });

  it('propagates strategy rejection as 401', async () => {
    const { guard } = createGuard({ rejects: new UnauthorizedException('Invalid or expired token') });
    const ctx = createContext({ authorization: 'Bearer token' });
    await expect(guard.canActivate(ctx as never)).rejects.toThrow('Invalid or expired token');
  });
});
