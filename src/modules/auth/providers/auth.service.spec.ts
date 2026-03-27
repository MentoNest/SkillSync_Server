import { ConflictException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MailService } from '../../mail/mail.service';
import { UserService } from '../../user/providers/user.service';
import { CacheService } from '../../../common/cache/cache.service';
import { JwtService } from '@nestjs/jwt';
import { NonceService } from '../../../common/cache/nonce.service';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../audit/providers/audit.service';
import { StellarNonceService } from './nonce.service';

describe('AuthService - Forgot Password Flow', () => {
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let userServiceMock: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updatePassword: jest.Mock;
  };
  let mailServiceMock: {
    sendWelcomeEmail: jest.Mock;
    sendLoginEmail: jest.Mock;
    sendOtpEmail: jest.Mock;
  };
  let cacheServiceMock: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };
  let jwtServiceMock: {
    sign: jest.Mock;
    verify: jest.Mock;
  };
  let configServiceMock: {
    get: jest.Mock;
  };
  let nonceServiceMock: {
    storeNonce: jest.Mock;
    isNonceValid: jest.Mock;
  };
  let auditServiceMock: {
    recordTokenReuseAttempt: jest.Mock;
    logLogout: jest.Mock;
    logRegistration: jest.Mock;
  };
  let stellarNonceServiceMock: {
    consume: jest.Mock;
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
      updatePassword: jest.fn(),
    };

    mailServiceMock = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendLoginEmail: jest.fn().mockResolvedValue(undefined),
      sendOtpEmail: jest.fn().mockResolvedValue(undefined),
    };

    cacheServiceMock = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    jwtServiceMock = {
      sign: jest.fn(),
      verify: jest.fn(),
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

    configServiceMock = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          JWT_EXPIRES_IN: '1h',
          JWT_SECRET: 'secret',
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_REFRESH_EXPIRES_IN: '7d',
          mailAppName: 'SkillSync',
          mailSubjectPrefix: '[SkillSync]',
          mailSender: 'noreply@skillsync.com',
        };
        return values[key] || defaultValue;
      }),
    };

    nonceServiceMock = {
      storeNonce: jest.fn(),
      isNonceValid: jest.fn(),
    };

    auditServiceMock = {
      recordTokenReuseAttempt: jest.fn(),
    jwtServiceMock = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    stellarNonceServiceMock = {
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

  describe('forgotPassword', () => {
    it('should send OTP email when user exists', async () => {
      const email = 'test@example.com';
      const user = { id: '1', email, passwordHash: 'hashed' };
      
      userServiceMock.findByEmail.mockResolvedValue(user);
      
      const result = await authService.forgotPassword({ email });
      
      expect(userServiceMock.findByEmail).toHaveBeenCalledWith(email);
      expect(cacheServiceMock.set).toHaveBeenCalled(); // Called to store OTP
      expect(mailServiceMock.sendOtpEmail).toHaveBeenCalledWith(email, expect.any(String));
      expect(result).toEqual({ message: 'If an account exists, an OTP has been sent to your email' });
    });

    it('should return success message when user does not exist (prevent enumeration)', async () => {
      const email = 'nonexistent@example.com';
      
      userServiceMock.findByEmail.mockResolvedValue(null);
      
      const result = await authService.forgotPassword({ email });
      
      expect(userServiceMock.findByEmail).toHaveBeenCalledWith(email);
      expect(mailServiceMock.sendOtpEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'If an account exists, an OTP has been sent to your email' });
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

  describe('verifyOtp', () => {
    it('should return valid when OTP is correct', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const storedOtp = '123456';
      
      cacheServiceMock.get.mockResolvedValue(storedOtp);
      
      const result = await authService.verifyOtp({ email, otp });
      
      expect(cacheServiceMock.get).toHaveBeenCalledWith(`otp:${email}`);
      expect(result).toEqual({ valid: true, message: 'OTP verified successfully' });
    });

    it('should return invalid when OTP is incorrect', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const storedOtp = '654321';
      
      cacheServiceMock.get.mockResolvedValue(storedOtp);
      
      const result = await authService.verifyOtp({ email, otp });
      
      expect(cacheServiceMock.get).toHaveBeenCalledWith(`otp:${email}`);
      expect(result).toEqual({ valid: false, message: 'Invalid or expired OTP' });
    });

    it('should return invalid when OTP does not exist', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      
      cacheServiceMock.get.mockResolvedValue(null);
      
      const result = await authService.verifyOtp({ email, otp });
      
      expect(cacheServiceMock.get).toHaveBeenCalledWith(`otp:${email}`);
      expect(result).toEqual({ valid: false, message: 'Invalid or expired OTP' });
    });
  });

  describe('resetPassword', () => {
    it('should reset password when OTP is valid', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const newPassword = 'newSecurePassword123!';
      const storedOtp = '123456';
      const user = { id: '1', email, passwordHash: 'oldHash' };
      
      cacheServiceMock.get.mockResolvedValue(storedOtp);
      userServiceMock.findByEmail.mockResolvedValue(user);
      
      const result = await authService.resetPassword({ email, otp, newPassword });
      
      expect(cacheServiceMock.get).toHaveBeenCalledWith(`otp:${email}`);
      expect(userServiceMock.findByEmail).toHaveBeenCalledWith(email);
      expect(userServiceMock.updatePassword).toHaveBeenCalledWith(user.id, expect.any(String)); // hashed password
      expect(cacheServiceMock.del).toHaveBeenCalledWith(`otp:${email}`);
      expect(result).toEqual({ message: 'Password has been reset successfully' });
    });

    it('should throw error when OTP is invalid', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const newPassword = 'newSecurePassword123!';
      const storedOtp = '654321';
      
      cacheServiceMock.get.mockResolvedValue(storedOtp);
      
      await expect(authService.resetPassword({ email, otp, newPassword })).rejects.toThrow(BadRequestException);
      expect(userServiceMock.findByEmail).not.toHaveBeenCalled();
      expect(userServiceMock.updatePassword).not.toHaveBeenCalled();
    });

    it('should throw error when user does not exist', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const newPassword = 'newSecurePassword123!';
      const storedOtp = '123456';
      
      cacheServiceMock.get.mockResolvedValue(storedOtp);
      userServiceMock.findByEmail.mockResolvedValue(null);
      
      await expect(authService.resetPassword({ email, otp, newPassword })).rejects.toThrow(BadRequestException);
      expect(userServiceMock.updatePassword).not.toHaveBeenCalled();
    });
  });
});