import { Test, TestingModule } from '@nestjs/testing';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { RedisService } from '../../config/redis.module.js';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;

  const mockRedisService = {
    set: jest.fn(),
    exists: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<TokenBlacklistService>(TokenBlacklistService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('blacklist', () => {
    it('should store the jti with the given TTL', async () => {
      await service.blacklist('jti-1', 900);
      expect(mockRedisService.set).toHaveBeenCalledWith('blacklist:jti-1', '1', 900);
    });

    it('should not store anything for a non-positive TTL', async () => {
      await service.blacklist('jti-1', 0);
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });

    it('should not store anything for an empty jti', async () => {
      await service.blacklist('', 900);
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });

  describe('isBlacklisted', () => {
    it('should return true when the key exists', async () => {
      mockRedisService.exists.mockResolvedValue(true);
      const result = await service.isBlacklisted('jti-1');
      expect(result).toBe(true);
      expect(mockRedisService.exists).toHaveBeenCalledWith('blacklist:jti-1');
    });

    it('should return false when the key does not exist', async () => {
      mockRedisService.exists.mockResolvedValue(false);
      const result = await service.isBlacklisted('jti-1');
      expect(result).toBe(false);
    });

    it('should return false for an empty jti without querying Redis', async () => {
      const result = await service.isBlacklisted('');
      expect(result).toBe(false);
      expect(mockRedisService.exists).not.toHaveBeenCalled();
    });
  });
});
