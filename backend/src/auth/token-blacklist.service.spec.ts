import type { Redis } from 'ioredis';
import { TokenBlacklistService } from './token-blacklist.service';

describe('TokenBlacklistService', () => {
  const nowSeconds = 1_700_000_000;

  let redis: { set: jest.Mock; exists: jest.Mock };
  let service: TokenBlacklistService;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(nowSeconds * 1000);
    redis = { set: jest.fn().mockResolvedValue('OK'), exists: jest.fn().mockResolvedValue(0) };
    service = new TokenBlacklistService(redis as unknown as Redis);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('blacklist', () => {
    it('stores the jti with a TTL equal to the remaining token lifetime', async () => {
      await service.blacklist('jti-1', nowSeconds + 900);

      expect(redis.set).toHaveBeenCalledWith('auth:blacklist:jti-1', '1', 'EX', 900);
    });

    it('does not write an entry for a token that has already expired', async () => {
      await service.blacklist('jti-1', nowSeconds - 1);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('does not write an entry when exp equals now, since the TTL would be zero', async () => {
      await service.blacklist('jti-1', nowSeconds);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('keys entries by jti so two tokens do not collide', async () => {
      await service.blacklist('jti-a', nowSeconds + 60);
      await service.blacklist('jti-b', nowSeconds + 60);

      expect(redis.set).toHaveBeenNthCalledWith(1, 'auth:blacklist:jti-a', '1', 'EX', 60);
      expect(redis.set).toHaveBeenNthCalledWith(2, 'auth:blacklist:jti-b', '1', 'EX', 60);
    });
  });

  describe('isBlacklisted', () => {
    it('is true when redis reports the key exists', async () => {
      redis.exists.mockResolvedValue(1);
      await expect(service.isBlacklisted('jti-1')).resolves.toBe(true);
      expect(redis.exists).toHaveBeenCalledWith('auth:blacklist:jti-1');
    });

    it('is false when redis reports the key is absent', async () => {
      redis.exists.mockResolvedValue(0);
      await expect(service.isBlacklisted('jti-1')).resolves.toBe(false);
    });

    it('is false when redis returns an unexpected value rather than truthy-coercing it', async () => {
      redis.exists.mockResolvedValue(2);
      await expect(service.isBlacklisted('jti-1')).resolves.toBe(false);
    });
  });
});