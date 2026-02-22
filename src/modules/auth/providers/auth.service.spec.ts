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
  };
  let stellarNonceServiceMock: {
    consume: jest.Mock;
  };

  beforeEach(() => {
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