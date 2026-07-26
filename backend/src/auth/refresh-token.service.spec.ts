import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(14),
  };

  const deviceInfo = { userAgent: 'jest', ipAddress: '127.0.0.1' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: getRepositoryToken(RefreshToken), useValue: mockRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RefreshTokenService>(RefreshTokenService);
    mockRepo.create.mockImplementation(
      (entry: Record<string, unknown>) => entry,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('issue', () => {
    it('should create and persist a hashed refresh token with device info', async () => {
      mockRepo.save.mockResolvedValue({});

      const result = await service.issue('user-1', deviceInfo);

      expect(result.token).toHaveLength(128);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          userAgent: 'jest',
          ipAddress: '127.0.0.1',
        }),
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const createArgs = mockRepo.create.mock.calls[0][0] as {
        tokenHash: string;
      };
      expect(createArgs.tokenHash).not.toBe(result.token);
    });
  });

  describe('rotate', () => {
    it('should throw UnauthorizedException when the token does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.rotate('bad-token', deviceInfo)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException and revoke all tokens when a revoked token is reused', async () => {
      mockRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 100000),
      });
      mockRepo.update.mockResolvedValue({});

      await expect(service.rotate('reused-token', deviceInfo)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('should throw UnauthorizedException when the token has expired', async () => {
      mockRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.rotate('expired-token', deviceInfo)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should rotate a valid token: revoke the old one and issue a new one', async () => {
      const existing = {
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      };
      mockRepo.findOne.mockResolvedValue(existing);
      mockRepo.save.mockResolvedValue({});

      const result = await service.rotate('valid-token', deviceInfo);

      expect(existing.revokedAt).not.toBeNull();
      expect(result.userId).toBe('user-1');
      expect(result.token).toHaveLength(128);
      expect(mockRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('revokeAllForUser', () => {
    it('should mark all of the user tokens as revoked', async () => {
      mockRepo.update.mockResolvedValue({});

      await service.revokeAllForUser('user-1');

      expect(mockRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });
});
