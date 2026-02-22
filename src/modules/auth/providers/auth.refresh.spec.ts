import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService refresh token rotation', () => {
  let authService: AuthService;
  const store = new Map<string, string>();

  const nonceServiceMock = {
    storeNonce: jest.fn(),
    isNonceValid: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const values: Record<string, string> = {
        JWT_EXPIRES_IN: '1h',
        JWT_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return values[key] ?? defaultValue;
    }),
  };

  const cacheServiceMock = {
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };

  const user = {
    id: 'user-1',
    email: 'test@example.com',
    password: '$2b$10$abcdefghijklmnopqrstuv',
    firstName: 'Test',
    lastName: 'User',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const userServiceMock = {
    findByEmail: jest.fn(async () => user),
    findById: jest.fn(async () => user),
  };

  const mailServiceMock = {
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendLoginEmail: jest.fn().mockResolvedValue(undefined),
  };

  const parseRefreshToken = (token: string) => {
    const [, sub, email, sid, family, jti] = token.split('|');
    return {
      sub,
      email,
      sid,
      family,
      jti,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    };
  };

  const jwtServiceMock = {
    sign: jest.fn((payload: any) => {
      if (payload.type === 'refresh') {
        return `refresh|${payload.sub}|${payload.email}|${payload.sid}|${payload.family}|${payload.jti}`;
      }
      return `access|${payload.sub}|${payload.email}`;
    }),
    verify: jest.fn((token: string) => parseRefreshToken(token)),
  };

  const auditServiceMock = {
    recordTokenReuseAttempt: jest.fn(),
  };

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();

    authService = new AuthService(
      nonceServiceMock as any,
      configServiceMock as any,
      cacheServiceMock as any,
      userServiceMock as any,
      mailServiceMock as any,
      jwtServiceMock as any,
      {} as any, // stellarNonceService
      auditServiceMock as any,
    );
  });

  it('rotates refresh token on every refresh call', async () => {
    const sessionId = 'session-1';
    const tokenFamily = 'family-1';
    const tokenId = 'token-1';
    const firstRefreshToken = jwtServiceMock.sign({
      sub: user.id,
      email: user.email,
      sid: sessionId,
      family: tokenFamily,
      jti: tokenId,
      type: 'refresh',
    });
    store.set(`auth:session:${sessionId}:current-jti`, tokenId);

    const rotated = await authService.refresh(firstRefreshToken);

    expect(rotated.refreshToken).not.toEqual(firstRefreshToken);
    expect(rotated.accessToken).toContain('access|');
  });

  it('revokes session and returns 401 on reused invalidated refresh token', async () => {
    const sessionId = 'session-2';
    const tokenFamily = 'family-2';
    const tokenId = 'token-2';
    const firstRefreshToken = jwtServiceMock.sign({
      sub: user.id,
      email: user.email,
      sid: sessionId,
      family: tokenFamily,
      jti: tokenId,
      type: 'refresh',
    });
    store.set(`auth:session:${sessionId}:current-jti`, tokenId);

    await authService.refresh(firstRefreshToken);

    await expect(authService.refresh(firstRefreshToken)).rejects.toBeInstanceOf(UnauthorizedException);

    const payload = parseRefreshToken(firstRefreshToken);
    expect(store.get(`auth:session:${payload.sid}:revoked`)).toBe('1');
    expect(auditServiceMock.recordTokenReuseAttempt).toHaveBeenCalledWith({
      userId: payload.sub,
      sessionId: payload.sid,
      tokenId: payload.jti,
    });
  });
});
