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
    logLogout: jest.fn(),
    logRefreshToken: jest.fn(),
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

  describe('logout and token invalidation', () => {
    it('should return 401 when using refresh token after logout', async () => {
      const sessionId = 'session-logout-1';
      const tokenFamily = 'family-logout-1';
      const tokenId = 'token-logout-1';
      const refreshToken = jwtServiceMock.sign({
        sub: user.id,
        email: user.email,
        sid: sessionId,
        family: tokenFamily,
        jti: tokenId,
        type: 'refresh',
      });
      store.set(`auth:session:${sessionId}:current-jti`, tokenId);

      // First, logout the user
      const logoutResult = await authService.logout(refreshToken);
      expect(logoutResult.message).toBe('Logout successful');

      // Verify session is revoked
      expect(store.get(`auth:session:${sessionId}:revoked`)).toBe('1');

      // Attempt to use the same refresh token after logout should fail
      await expect(authService.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should return 401 when refresh token from revoked session is used', async () => {
      const sessionId = 'session-revoked-1';
      const tokenFamily = 'family-revoked-1';
      const tokenId = 'token-revoked-1';
      const refreshToken = jwtServiceMock.sign({
        sub: user.id,
        email: user.email,
        sid: sessionId,
        family: tokenFamily,
        jti: tokenId,
        type: 'refresh',
      });
      store.set(`auth:session:${sessionId}:current-jti`, tokenId);

      // Manually revoke the session (simulating logout or admin revocation)
      store.set(`auth:session:${sessionId}:revoked`, '1');

      // Attempt to refresh with revoked session token
      await expect(authService.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auditServiceMock.logRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          email: user.email,
          sessionId,
          success: false,
          failureReason: 'Session has been revoked',
        }),
      );
    });

    it('should successfully refresh with valid token from active session', async () => {
      const sessionId = 'session-active-1';
      const tokenFamily = 'family-active-1';
      const tokenId = 'token-active-1';
      const refreshToken = jwtServiceMock.sign({
        sub: user.id,
        email: user.email,
        sid: sessionId,
        family: tokenFamily,
        jti: tokenId,
        type: 'refresh',
      });
      store.set(`auth:session:${sessionId}:current-jti`, tokenId);

      // Ensure session is not revoked
      store.delete(`auth:session:${sessionId}:revoked`);

      const result = await authService.refresh(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toEqual(refreshToken);
    });

    it('should handle multiple sessions independently - logout one does not affect other', async () => {
      // Session 1
      const sessionId1 = 'session-multi-1';
      const tokenId1 = 'token-multi-1';
      const refreshToken1 = jwtServiceMock.sign({
        sub: user.id,
        email: user.email,
        sid: sessionId1,
        family: 'family-multi',
        jti: tokenId1,
        type: 'refresh',
      });
      store.set(`auth:session:${sessionId1}:current-jti`, tokenId1);

      // Session 2
      const sessionId2 = 'session-multi-2';
      const tokenId2 = 'token-multi-2';
      const refreshToken2 = jwtServiceMock.sign({
        sub: user.id,
        email: user.email,
        sid: sessionId2,
        family: 'family-multi-2',
        jti: tokenId2,
        type: 'refresh',
      });
      store.set(`auth:session:${sessionId2}:current-jti`, tokenId2);

      // Logout session 1
      await authService.logout(refreshToken1);

      // Session 1 should be revoked
      expect(store.get(`auth:session:${sessionId1}:revoked`)).toBe('1');

      // Session 2 should still be active
      expect(store.get(`auth:session:${sessionId2}:revoked`)).toBeFalsy();

      // Session 2 refresh should work
      const result = await authService.refresh(refreshToken2);
      expect(result.accessToken).toBeDefined();

      // Session 1 refresh should fail
      await expect(authService.refresh(refreshToken1)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
