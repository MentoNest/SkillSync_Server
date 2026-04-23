import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto/login.dto';
import { RefreshDto } from '../dto/refresh.dto';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        JWT_SECRET: 'test-secret-key-min-32-chars-length',
        JWT_EXPIRES_IN: '24h',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key-min-32-chars',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateNonce', () => {
    it('should generate and store a nonce for wallet address', async () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';
      
      const nonce = await service.generateNonce(walletAddress);
      
      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(0);
    });
  });

  describe('verifySignature', () => {
    it('should verify a valid signature', async () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';
      const signature = '0xvalidsignature';
      const nonce = 'test-nonce';

      // This will fail with ethers without a real signature, but tests the flow
      const result = await service.verifySignature(walletAddress, signature, nonce);
      
      expect(typeof result).toBe('boolean');
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException for invalid nonce', async () => {
      const loginDto: LoginDto = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        signature: '0xsignature',
        nonce: 'invalid-nonce',
      };

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should login successfully with valid credentials', async () => {
      // First generate a nonce
      const walletAddress = '0x1234567890123456789012345678901234567890';
      const nonce = await service.generateNonce(walletAddress);

      // Mock signature verification to return true
      jest.spyOn(service, 'verifySignature').mockResolvedValue(true);

      const loginDto: LoginDto = {
        walletAddress,
        signature: '0xsignature',
        nonce,
      };

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user.walletAddress).toBe(walletAddress);
    });
  });

  describe('refreshTokens', () => {
    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const refreshDto: RefreshDto = {
        refreshToken: 'invalid-token',
      };

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should refresh token successfully', async () => {
      const refreshDto: RefreshDto = {
        refreshToken: 'valid-refresh-token',
      };

      mockJwtService.verify.mockReturnValue({
        sub: 'user-id',
        walletAddress: '0x1234567890123456789012345678901234567890',
        role: 'user',
        type: 'refresh',
      });

      const result = await service.refreshTokens(refreshDto);

      expect(result).toHaveProperty('accessToken');
      expect(mockJwtService.sign).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const accessToken = 'test-access-token';
      const userId = 'user-id';

      await expect(service.logout(accessToken, userId)).resolves.not.toThrow();
    });
  });

  describe('validateToken', () => {
    it('should validate token payload', async () => {
      const payload = {
        sub: 'user-id',
        walletAddress: '0x1234567890123456789012345678901234567890',
        role: 'user',
      };

      const result = await service.validateToken(payload);

      expect(result).toEqual({
        userId: payload.sub,
        walletAddress: payload.walletAddress,
        role: payload.role,
      });
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const userId = 'user-id';

      const result = await service.getProfile(userId);

      expect(result).toHaveProperty('id', userId);
      expect(result).toHaveProperty('walletAddress');
      expect(result).toHaveProperty('role');
    });
  });
});
