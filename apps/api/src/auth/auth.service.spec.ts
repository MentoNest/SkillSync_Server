import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import * as crypto from 'crypto';

describe('AuthService', () => {
  let service: AuthService;

  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    password_hash: '$2b$10$hashedpassword',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as User;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockRefreshTokenRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '604800',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'newuser@example.com',
      password: 'SecurePass123!',
      firstName: 'Jane',
      lastName: 'Smith',
    };

    it('should successfully register and return tokens', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('access-token');
      mockRefreshTokenRepository.create.mockReturnValue({ id: 'token-id' });
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.register(registerDto);

      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBe('access-token');
      expect(result.tokens.refreshToken).toBeDefined();
      expect(mockRefreshTokenRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if user exists', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'SecurePass123!',
    };

    it('should login and return tokens', async () => {
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        password_hash: hashedPassword,
      });
      mockJwtService.signAsync.mockResolvedValue('access-token');
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.login(loginDto);

      expect(result.tokens.accessToken).toBe('access-token');
      expect(mockRefreshTokenRepository.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('rotateRefreshToken', () => {
    const oldToken = 'old-token';
    const oldTokenHash = crypto
      .createHash('sha256')
      .update(oldToken)
      .digest('hex');

    it('should rotate refresh token successfully (old refresh becomes invalid)', async () => {
      const tokenRecord = {
        userId: mockUser.id,
        user: mockUser,
        tokenHash: oldTokenHash,
        expiresAt: new Date(Date.now() + 10000),
        revokedAt: null,
      } as unknown as RefreshToken;

      mockRefreshTokenRepository.findOne.mockResolvedValue(tokenRecord);
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});
      mockJwtService.signAsync.mockResolvedValue('new-access-token');

      const result = await service.rotateRefreshToken(oldToken);

      expect(result.accessToken).toBe('new-access-token');
      expect(tokenRecord.revokedAt).toBeInstanceOf(Date);
      expect(tokenRecord.replacedByTokenHash).toBeDefined();
      expect(mockRefreshTokenRepository.save).toHaveBeenCalled();
    });

    it('should detect reuse and revoke all tokens if already revoked (replay detection)', async () => {
      const tokenRecord = {
        userId: mockUser.id,
        tokenHash: oldTokenHash,
        revokedAt: new Date(),
      } as unknown as RefreshToken;

      mockRefreshTokenRepository.findOne.mockResolvedValue(tokenRecord);

      await expect(service.rotateRefreshToken(oldToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: mockUser.id, revokedAt: undefined },
        { revokedAt: expect.any(Date) as Date },
      );
    });

    it('should detect reuse if replacedByTokenHash is set (replay detection)', async () => {
      const tokenRecord = {
        userId: mockUser.id,
        tokenHash: oldTokenHash,
        replacedByTokenHash: 'some-hash',
      } as unknown as RefreshToken;

      mockRefreshTokenRepository.findOne.mockResolvedValue(tokenRecord);

      await expect(service.rotateRefreshToken(oldToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRefreshTokenRepository.update).toHaveBeenCalled();
    });

    it('should fail if token expired', async () => {
      const tokenRecord = {
        userId: mockUser.id,
        tokenHash: oldTokenHash,
        expiresAt: new Date(Date.now() - 10000),
      } as unknown as RefreshToken;

      mockRefreshTokenRepository.findOne.mockResolvedValue(tokenRecord);

      await expect(service.rotateRefreshToken(oldToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('revokeRefreshToken (Logout)', () => {
    it('should revoke the token if found', async () => {
      const token = 'active-token';
      const tokenRecord = {
        tokenHash: 'some-hash',
        revokedAt: null,
      } as unknown as RefreshToken;

      mockRefreshTokenRepository.findOne.mockResolvedValue(tokenRecord);
      mockRefreshTokenRepository.save.mockResolvedValue({});

      await service.revokeRefreshToken(token);

      expect(tokenRecord.revokedAt).toBeInstanceOf(Date);
      expect(mockRefreshTokenRepository.save).toHaveBeenCalledWith(tokenRecord);
    });

    it('should subsequent refresh fail after logout (implicit by revokedAt check)', async () => {
      const token = 'active-token';
      const tokenRecord = {
        tokenHash: 'some-hash',
        revokedAt: null,
      } as unknown as RefreshToken;

      mockRefreshTokenRepository.findOne.mockResolvedValue(tokenRecord);
      await service.revokeRefreshToken(token);

      expect(tokenRecord.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('Token store integrity', () => {
    it('should save hashed tokens in DB not plain text', async () => {
      const token = 'plain-text-token';
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('access');
      mockRefreshTokenRepository.create.mockImplementation(
        (dto: unknown) => dto,
      );
      mockRefreshTokenRepository.save.mockResolvedValue({});

      await service.register({
        email: 't@t.com',
        password: 'p',
        firstName: 'f',
        lastName: 'l',
      });

      const createCall = mockRefreshTokenRepository.create.mock.calls[0] as [
        { tokenHash: string },
      ];
      const savedTokenHash = createCall[0].tokenHash;
      expect(savedTokenHash).not.toBe(token);
      expect(savedTokenHash).toHaveLength(64); // SHA256 length
    });
  });
});
