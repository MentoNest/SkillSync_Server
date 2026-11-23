import { Logger } from '@nestjs/common';
import { RedisNamespace } from './redis.config';
import { RedisHealthController } from './redis.health.controller';
import { RedisService } from './redis.service';

function makeClient() {
  return {
    get: jest.fn(),
    mget: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    eval: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    scan: jest.fn(),
    expire: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
  };
}

describe('RedisService', () => {
  let client: ReturnType<typeof makeClient>;
  let service: RedisService;

  beforeEach(() => {
    client = makeClient();
    service = new RedisService(client as never, 'skillsync:');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reads and writes under the namespaced, prefixed key', async () => {
    client.get.mockResolvedValue('value');

    await expect(service.get(RedisNamespace.CACHE, 'k')).resolves.toBe('value');
    expect(client.get).toHaveBeenCalledWith('skillsync:cache:k');

    await service.set(RedisNamespace.SESSION, 'k', 'v');
    expect(client.set).toHaveBeenCalledWith('skillsync:session:k', 'v');
  });

  it('sets an expiry when a TTL is given', async () => {
    await service.set(RedisNamespace.CACHE, 'k', 'v', 60);
    expect(client.set).toHaveBeenCalledWith('skillsync:cache:k', 'v', 'EX', 60);
  });

  it('atomically increments a counter with an expiry', async () => {
    client.eval.mockResolvedValue(3);

    await expect(service.incrementWithExpiry(RedisNamespace.RATE_LIMIT, 'nonce:k', 60)).resolves.toBe(3);
    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      1,
      'skillsync:ratelimit:nonce:k',
      60,
    );
  });

  it('deletes, expires and checks existence', async () => {
    await expect(service.del(RedisNamespace.CACHE, 'k')).resolves.toBe(1);
    expect(client.del).toHaveBeenCalledWith('skillsync:cache:k');

    await expect(service.expire(RedisNamespace.CACHE, 'k', 30)).resolves.toBe(true);
    expect(client.expire).toHaveBeenCalledWith('skillsync:cache:k', 30);

    client.expire.mockResolvedValue(0);
    await expect(service.expire(RedisNamespace.CACHE, 'missing', 30)).resolves.toBe(false);

    await expect(service.exists(RedisNamespace.BLACKLIST, 'jti')).resolves.toBe(true);
  });

  it('deletes every refresh token belonging to the requested user', async () => {
    client.del.mockResolvedValue(2);
    client.scan
      .mockResolvedValueOnce([
        '1',
        ['skillsync:session:refresh:first', 'skillsync:session:refresh:other'],
      ])
      .mockResolvedValueOnce(['0', ['skillsync:session:refresh:second']]);
    client.mget
      .mockResolvedValueOnce(['wallet-a', 'wallet-b'])
      .mockResolvedValueOnce(['wallet-a']);

    await expect(service.revokeRefreshTokensForUser('wallet-a')).resolves.toBe(2);
    expect(client.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'skillsync:session:refresh:*',
      'COUNT',
      100,
    );
    expect(client.del).toHaveBeenCalledWith(
      'skillsync:session:refresh:first',
      'skillsync:session:refresh:second',
    );
  });

  it('pings and reports health', async () => {
    await expect(service.ping()).resolves.toEqual(expect.any(Number));
    await expect(service.isHealthy()).resolves.toBe(true);

    client.ping.mockRejectedValue(new Error('connection lost'));
    await expect(service.isHealthy()).resolves.toBe(false);
    client.ping.mockResolvedValue('LOADING');
    await expect(service.ping()).rejects.toThrow('Unexpected reply');
  });

  it('closes the connection on shutdown, falling back to disconnect', async () => {
    await service.onModuleDestroy();
    expect(client.quit).toHaveBeenCalled();

    client.quit.mockRejectedValue(new Error('already closed'));
    await service.onModuleDestroy();
    expect(client.disconnect).toHaveBeenCalled();
  });
});

describe('RedisHealthController', () => {
  it('returns up with the latency', async () => {
    const controller = new RedisHealthController({ ping: jest.fn().mockResolvedValue(3) } as never);
    await expect(controller.check()).resolves.toEqual({ status: 'up', latencyMs: 3 });
  });

  it('answers 503 when Redis does not respond', async () => {
    const controller = new RedisHealthController({
      ping: jest.fn().mockRejectedValue(new Error('timeout')),
    } as never);
    await expect(controller.check()).rejects.toThrow('Redis is not reachable: timeout');
  });
});
