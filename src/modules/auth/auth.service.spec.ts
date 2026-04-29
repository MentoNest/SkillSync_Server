import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnauthorizedException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { RedisService } from '../../../redis/redis.service';
import { User, UserRole, UserStatus } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { AuditLog, AuditEventType } from '../entities/audit-log.entity';
import { LoginDto } from '../dto/login.dto';
import { RefreshDto } from '../dto/refresh.dto';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let redisService: RedisService;
  let userRepository: Repository<User>;
  let roleRepository: Repository<Role>;
  let refreshTokenRepository: Repository<RefreshToken>;
  let auditLogRepository: Repository<AuditLog>;

  const mockUser: Partial<User> = {
    id: 'user-123',
    walletAddress: 'GBTESTWALLETADDRESS1234567890ABCDEFGHIJKLMNO',
    roles: [{ id: 'role-1', name: UserRole.MENTEE, description: 'Mentee' } as Role],
    tokenVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
    status: UserStatus.ACTIVE,
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn().mockReturnValue({
      sub: 'user-123',
      walletAddress: 'GBTESTWALLETADDRESS1234567890ABCDEFGHIJKLMNO',
      roles: [UserRole.MENTEE],
      type: 'refresh',
      jti: 'mock-jti',
      tokenVersion: 1,
    }),
    decode: jest.fn().mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: 'mock-jti',
    }),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const config: Record<string, string> = {
        JWT_SECRET: 'test-secret-key-must-be-at-least-32-characters',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key-must-be-32-chars',
        JWT_EXPIRES_IN: '1h',
        JWT_REFRESH_EXPIRES_IN: '7d',
        JWT_ACCESS_EXPIRATION: '15m',
      };
      return config[key];
    }),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue('test-nonce'),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
    exists: jest.fn().mockResolvedValue(false),
  };

  const mockUserRepository = {
    findOne: jest.fn().mockResolvedValue(mockUser),
    create: jest.fn().mockImplementation((data) => data),
    save: jest.fn().mockResolvedValue(mockUser),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockRoleRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'role-1', name: UserRole.MENTEE }),
    create: jest.fn().mockImplementation((data) => data),
    save: jest.fn().mockResolvedValue({ id: 'role-1', name: UserRole.MENTEE }),
  };

  const mockRefreshTokenRepository = {
    findOne: jest.fn().mockResolvedValue({
      token: 'mock-refresh-token',
      userId: 'user-123',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      user: mockUser,
    }),
    create: jest.fn().mockImplementation((data) => data),
    save: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockAuditLogRepository = {
    create: jest.fn().mockImplementation((data) => data),
    save: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Role), useValue: mockRoleRepository },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshTokenRepository },
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditLogRepository },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    redisService = module.get<RedisService>(RedisService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    roleRepository = module.get<Repository<Role>>(getRepositoryToken(Role));
    refreshTokenRepository = module.get<Repository<RefreshToken>>(getRepositoryToken(RefreshToken));
    auditLogRepository = module.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateNonce', () => {
    it('should generate a nonce successfully', async () => {
      mockRedisService.incr.mockResolvedValue(1);

      const result = await service.generateNonce('GBTESTWALLETADDRESS1234567890ABCDEFGHIJKLMNO');

      expect(result).toHaveProperty('nonce');
      expect(result).toHaveProperty('expiresAt');
      expect(typeof result.nonce).toBe('string');
      expect(result.nonce.length).toBe(64);
      expect(redisService.set).toHaveBeenCalled();
      expect(auditLogRepository.save).toHaveBeenCalled();
    });

    it('should throw error when rate limit exceeded', async () => {
      mockRedisService.incr.mockResolvedValue(6);

      await expect(
        service.generateNonce('GBTESTWALLETADDRESS1234567890ABCDEFGHIJKLMNO'),
      ).rejects.toThrow(HttpException);

      await expect(
        service.generateNonce('GBTESTWALLETADDRESS1234567890ABCDEFGHIJKLMNO'),
      ).rejects.toHaveProperty('status', HttpStatus.TOO_MANY_REQUESTS);
    });
  });

  describe('verifySignature', () => {
    it('should return false for invalid signature format', async () => {
      const result = await service.verifySignature(
        'GBTESTWALLETADDRESS1234567890ABCDEFGHIJKLMNO',
        'invalid-signature',
        'test-nonce',
      );

      expect(result).toBe(false);
    });

    it('should return false when signature verification fails', async () => {
      const result = await service.verifySignature(
        'invalid-wallet',
        'invalid',
        'test-nonce',
      );

      expect(result).toBe(false);
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      walletAddress: 'GBTESTWALLETADDRESS1234567890ABCDEFGHIJKLMNO',
      signature: 'valid-signature',
      nonce: 'test-nonce',
    };

    it('should login successfully with valid credentials', async () => {
      mockRedisService.incr.mockResolvedValueOnce(1);
      mockRedisService.get.mockResolvedValue('test-nonce');

      jest.spyOn(service, 'verifySignature').mockResolvedValue(true);

      const result = await service.login(loginDto, 'test-agent', '127.0.0.1');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user.id).toBe('user-123');
      expect(result.user.roles).toContain(UserRole.MENTEE);
    });

    it('should throw error for invalid nonce', async () => {
      mockRedisService.incr.mockResolvedValueOnce(1);
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.login(loginDto, 'test-agent', '127.0.0.1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw error for invalid signature', async () => {
      mockRedisService.incr.mockResolvedValueOnce(1);
      mockRedisService.get.mockResolvedValue('test-nonce');
      jest.spyOn(service, 'verifySignature').mockResolvedValue(false);

      await expect(service.login(loginDto, 'test-agent', '127.0.0.1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw error when rate limit exceeded', async () => {
      mockRedisService.incr.mockResolvedValue(11);

      await expect(service.login(loginDto, 'test-agent', '127.0.0.1')).rejects.toThrow(
        HttpException,
      );
    });

    it('should create new user if not exists', async () => {
      mockRedisService.incr.mockResolvedValueOnce(1);
      mockRedisService.get.mockResolvedValue('test-nonce');
      jest.spyOn(service, 'verifySignature').mockResolvedValue(true);
      mockUserRepository.findOne.mockResolvedValueOnce(null);
      mockRoleRepository.findOne.mockResolvedValue(null);

      const result = await service.login(loginDto, 'test-agent', '127.0.0.1');

      expect(userRepository.create).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
      expect(result.user.roles).toContain(UserRole.MENTEE);
    });
  });

  describe('refreshTokens', () => {
    const refreshDto: RefreshDto = {
      refreshToken: 'mock-refresh-token',
      deviceFingerprint: 'mock-fingerprint',
    };

    it('should refresh tokens successfully', async () => {
      const result = await service.refreshTokens(refreshDto, 'test-agent', '127.0.0.1');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(refreshTokenRepository.update).toHaveBeenCalled();
    });

    it('should throw error for invalid token type', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        ...mockJwtService.verify(),
        type: 'access',
      });

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error when token is blacklisted', async () => {
      mockRedisService.exists.mockResolvedValue(true);

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error when refresh token not found', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error when refresh token is revoked', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue({
        isRevoked: true,
      });

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error when refresh token expired', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue({
        isRevoked: false,
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(Date.now() - 2000),
      });

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      await service.logout('mock-access-token', 'user-123');

      expect(redisService.set).toHaveBeenCalled();
      expect(refreshTokenRepository.update).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('should logout all sessions', async () => {
      await service.logoutAll('user-123');

      expect(userRepository.findOne).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
      expect(refreshTokenRepository.update).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('revokeAll', () => {
    it('should revoke all sessions', async () => {
      const result = await service.revokeAll('user-123');

      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('revokedCount');
      expect(userRepository.save).toHaveBeenCalled();
      expect(auditLogRepository.save).toHaveBeenCalled();
    });

    it('should throw error when user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.revokeAll('invalid-user')).rejects.toThrow(UnauthorizedException);
    });

    it('should enforce rate limit', async () => {
      mockRedisService.incr.mockResolvedValue(4);

      await expect(service.revokeAll('user-123')).rejects.toThrow(HttpException);
    });
  });

  describe('validateToken', () => {
    const mockPayload = {
      sub: 'user-123',
      walletAddress: 'GBTESTWALLETADDRESS1234567890ABCDEFGHIJKLMNO',
      roles: [UserRole.MENTEE],
      permissions: ['read:profile'],
      jti: 'mock-jti',
      tokenVersion: 1,
    };

    it('should validate token successfully', async () => {
      const result = await service.validateToken(mockPayload);

      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('walletAddress');
      expect(result).toHaveProperty('roles');
      expect(result).toHaveProperty('permissions');
    });

    it('should throw error when token is blacklisted', async () => {
      mockRedisService.exists.mockResolvedValue(true);

      await expect(service.validateToken(mockPayload)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error when user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.validateToken(mockPayload)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error when token version mismatch', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        tokenVersion: 2,
      });

      await expect(service.validateToken(mockPayload)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getProfile', () => {
    it('should get user profile successfully', async () => {
      const result = await service.getProfile('user-123');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('walletAddress');
      expect(result).toHaveProperty('roles');
      expect(result).toHaveProperty('permissions');
      expect(result.id).toBe('user-123');
    });

    it('should throw error when user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getProfile('invalid-user')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('assignRole', () => {
    it('should assign role successfully', async () => {
      const adminUser = {
        ...mockUser,
        roles: [{ id: 'admin-role', name: UserRole.ADMIN } as Role],
      };
      mockUserRepository.findOne
        .mockResolvedValueOnce(adminUser)
        .mockResolvedValueOnce(mockUser);

      const result = await service.assignRole('admin-123', 'user-123', UserRole.MENTOR);

      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('roles');
    });

    it('should throw error when non-admin tries to assign role', async () => {
      const nonAdminUser = {
        ...mockUser,
        roles: [{ id: 'role-1', name: UserRole.MENTEE } as Role],
      };
      mockUserRepository.findOne.mockResolvedValue(nonAdminUser);

      await expect(
        service.assignRole('user-123', 'user-456', UserRole.MENTOR),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw error when user not found', async () => {
      const adminUser = {
        ...mockUser,
        roles: [{ id: 'admin-role', name: UserRole.ADMIN } as Role],
      };
      mockUserRepository.findOne
        .mockResolvedValueOnce(adminUser)
        .mockResolvedValueOnce(null);

      await expect(
        service.assignRole('admin-123', 'invalid-user', UserRole.MENTOR),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('revokeRole', () => {
    it('should revoke role successfully', async () => {
      const adminUser = {
        ...mockUser,
        roles: [{ id: 'admin-role', name: UserRole.ADMIN } as Role],
      };
      mockUserRepository.findOne
        .mockResolvedValueOnce(adminUser)
        .mockResolvedValueOnce(mockUser);

      const result = await service.revokeRole('admin-123', 'user-123', UserRole.MENTEE);

      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('roles');
    });

    it('should throw error when non-admin tries to revoke role', async () => {
      const nonAdminUser = {
        ...mockUser,
        roles: [{ id: 'role-1', name: UserRole.MENTEE } as Role],
      };
      mockUserRepository.findOne.mockResolvedValue(nonAdminUser);

      await expect(
        service.revokeRole('user-123', 'user-456', UserRole.MENTEE),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('parseExpirationToMs', () => {
    it('should parse seconds correctly', () => {
      const method = (service as any).parseExpirationToMs.bind(service);
      expect(method('30s')).toBe(30000);
    });

    it('should parse minutes correctly', () => {
      const method = (service as any).parseExpirationToMs.bind(service);
      expect(method('5m')).toBe(300000);
    });

    it('should parse hours correctly', () => {
      const method = (service as any).parseExpirationToMs.bind(service);
      expect(method('2h')).toBe(7200000);
    });

    it('should parse days correctly', () => {
      const method = (service as any).parseExpirationToMs.bind(service);
      expect(method('7d')).toBe(604800000);
    });

    it('should return default for invalid format', () => {
      const method = (service as any).parseExpirationToMs.bind(service);
      expect(method('invalid')).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('getPermissionsForRoles', () => {
    it('should return correct permissions for admin role', () => {
      const method = (service as any).getPermissionsForRoles.bind(service);
      const permissions = method([UserRole.ADMIN]);

      expect(permissions).toContain('read:all');
      expect(permissions).toContain('write:all');
      expect(permissions).toContain('manage:users');
    });

    it('should return correct permissions for mentor role', () => {
      const method = (service as any).getPermissionsForRoles.bind(service);
      const permissions = method([UserRole.MENTOR]);

      expect(permissions).toContain('read:profile');
      expect(permissions).toContain('write:profile');
      expect(permissions).toContain('read:sessions');
    });

    it('should return correct permissions for mentee role', () => {
      const method = (service as any).getPermissionsForRoles.bind(service);
      const permissions = method([UserRole.MENTEE]);

      expect(permissions).toContain('read:profile');
      expect(permissions).toContain('read:mentors');
    });

    it('should combine permissions for multiple roles', () => {
      const method = (service as any).getPermissionsForRoles.bind(service);
      const permissions = method([UserRole.ADMIN, UserRole.MENTOR]);

      expect(permissions).toContain('read:all');
      expect(permissions).toContain('read:profile');
      expect(permissions.length).toBeGreaterThan(3);
    });

    it('should return empty array for unknown role', () => {
      const method = (service as any).getPermissionsForRoles.bind(service);
      const permissions = method(['UNKNOWN_ROLE']);

      expect(permissions).toEqual([]);
    });
  });
});
