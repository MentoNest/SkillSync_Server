import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { WalletStrategy } from './strategies/wallet.strategy.js';

describe('AuthService', () => {
  let service: AuthService;

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-token'),
    verifyAsync: jest.fn(),
  };
  const mockConfigService = {
    get: jest.fn((key: string, def: string) => def),
  };
  const mockWalletStrategy = {
    generateNonce: jest.fn().mockReturnValue({ nonce: 'test-nonce', expiresAt: Date.now() + 60000 }),
    verify: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WalletStrategy, useValue: mockWalletStrategy },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('requestNonce', () => {
    it('should return a nonce and expiry', () => {
      const result = service.requestNonce('GABC');
      expect(result).toHaveProperty('nonce');
      expect(result).toHaveProperty('expiresAt');
    });
  });

  describe('logout', () => {
    it('should not throw when called with a jti', () => {
      expect(() => service.logout('some-jti')).not.toThrow();
    });

    it('isTokenRevoked should return true after logout', () => {
      service.logout('jti-abc');
      expect(service.isTokenRevoked('jti-abc')).toBe(true);
    });
  });
});
