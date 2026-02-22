import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let userServiceMock: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
  };
  let mailServiceMock: {
    sendWelcomeEmail: jest.Mock;
    sendLoginEmail: jest.Mock;
  };
  let cacheServiceMock: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };
  let auditServiceMock: {
    recordTokenReuseAttempt: jest.Mock;
    logLogout: jest.Mock;
    logRegistration: jest.Mock;
  };
  let jwtServiceMock: {
    sign: jest.Mock;
    verify: jest.Mock;
  };
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();

    userServiceMock = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };

    mailServiceMock = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendLoginEmail: jest.fn().mockResolvedValue(undefined),
    };

    cacheServiceMock = {
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      del: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    };

    auditServiceMock = {
      recordTokenReuseAttempt: jest.fn(),
      logLogout: jest.fn(),
      logRegistration: jest.fn(),
    };

    const nonceServiceMock = {
      storeNonce: jest.fn(),
    };

    const configServiceMock = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          JWT_EXPIRES_IN: '1h',
          JWT_SECRET: 'secret',
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };

        return values[key] ?? defaultValue;
      }),
    };

    jwtServiceMock = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const stellarNonceServiceMock = {
      consume: jest.fn(),
    };

    authService = new AuthService(
      nonceServiceMock as any,
      configServiceMock as any,
      cacheServiceMock as any,
      userServiceMock as any,
      mailServiceMock as any,
      jwtServiceMock as any,
      stellarNonceServiceMock as any,
      auditServiceMock as any,
    );
  });

  describe('logout', () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      isActive: true,
    };

    const createMockRefreshToken = (sessionId: string, tokenId: string) => {
      return `refresh|${mockUser.id}|${mockUser.email}|${sessionId}|family-1|${tokenId}`;
    };

    const parseMockToken = (token: string) => {
      const [, sub, email, sid, family, jti] = token.split('|');
      return {
        sub,
        email,
        sid,
        family,
        jti,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 604800, // 7 days
      };
    };

    it('should successfully logout with valid refresh token', async () => {
      const sessionId = 'session-1';
      const tokenId = 'token-1';
      const refreshToken = createMockRefreshToken(sessionId, tokenId);
      
      jwtServiceMock.verify.mockReturnValue(parseMockToken(refreshToken));

      const result = await authService.logout(refreshToken);

      expect(result.message).toBe('Logout successful');
      expect(store.get(`auth:session:${sessionId}:revoked`)).toBe('1');
      expect(auditServiceMock.logLogout).toHaveBeenCalledWith({
        userId: mockUser.id,
        email: mockUser.email,
        sessionId,
        ipAddress: undefined,
        userAgent: undefined,
      });
    });

    it('should throw UnauthorizedException when refresh token is missing', async () => {
      await expect(authService.logout('')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(authService.logout(null as any)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(authService.logout(undefined as any)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should throw UnauthorizedException when refresh token is invalid', async () => {
      const invalidToken = 'invalid-token';
      
      jwtServiceMock.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.logout(invalidToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token type is not refresh', async () => {
      const sessionId = 'session-1';
      const tokenId = 'token-1';
      const accessToken = `access|${mockUser.id}|${mockUser.email}|${sessionId}|family-1|${tokenId}`;
      
      jwtServiceMock.verify.mockReturnValue({
        sub: mockUser.id,
        email: mockUser.email,
        sid: sessionId,
        family: 'family-1',
        jti: tokenId,
        type: 'access', // Wrong type
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 604800,
      });

      await expect(authService.logout(accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should revoke session with correct TTL based on token expiration', async () => {
      const sessionId = 'session-2';
      const tokenId = 'token-2';
      const refreshToken = createMockRefreshToken(sessionId, tokenId);
      const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour remaining
      
      jwtServiceMock.verify.mockReturnValue({
        sub: mockUser.id,
        email: mockUser.email,
        sid: sessionId,
        family: 'family-1',
        jti: tokenId,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        exp,
      });

      await authService.logout(refreshToken);

      // Verify session is marked as revoked
      expect(store.get(`auth:session:${sessionId}:revoked`)).toBe('1');
      // Verify current-jti is deleted
      expect(store.has(`auth:session:${sessionId}:current-jti`)).toBe(false);
    });

    it('should include context information in audit log', async () => {
      const sessionId = 'session-3';
      const tokenId = 'token-3';
      const refreshToken = createMockRefreshToken(sessionId, tokenId);
      const context = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };
      
      jwtServiceMock.verify.mockReturnValue(parseMockToken(refreshToken));

      await authService.logout(refreshToken, context);

      expect(auditServiceMock.logLogout).toHaveBeenCalledWith({
        userId: mockUser.id,
        email: mockUser.email,
        sessionId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    });
  });

  it('creates a new user and sends welcome email', async () => {
    userServiceMock.findByEmail.mockResolvedValue(null);

    const user = {
      id: '1',
      email: 'test@example.com',
      password: 'hashedpassword',
      firstName: 'John',
      lastName: 'Doe',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    userServiceMock.create.mockResolvedValue(user);

    const result = await authService.register({
      firstName: 'John',
      lastName: 'Doe',
      email: 'test@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    } as any);

    expect(userServiceMock.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(userServiceMock.create).toHaveBeenCalled();
    expect(mailServiceMock.sendWelcomeEmail).toHaveBeenCalled();
    expect((result.user as any).password).toBeUndefined();
  });

  it('throws ConflictException when user already exists', async () => {
    const existingUser = {
      id: '1',
      email: 'test@example.com',
      password: 'hashedpassword',
      firstName: 'John',
      lastName: 'Doe',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    userServiceMock.findByEmail.mockResolvedValue(existingUser);

    await expect(
      authService.register({
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
