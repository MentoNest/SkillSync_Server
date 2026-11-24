import { Logger } from '@nestjs/common';
import { RedisNamespace } from './redis.config';
import { RedisHealthController } from './redis.health.controller';
import { RedisService } from './redis.service';

function makeClient() {
  return {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(1),
    eval: jest.fn().mockResolvedValue(1),
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

  it('deletes, expires and checks existence', async () => {
    await expect(service.del(RedisNamespace.CACHE, 'k')).resolves.toBe(1);
    expect(client.del).toHaveBeenCalledWith('skillsync:cache:k');

    await expect(service.expire(RedisNamespace.CACHE, 'k', 30)).resolves.toBe(
      true,
    );
    expect(client.expire).toHaveBeenCalledWith('skillsync:cache:k', 30);

    client.expire.mockResolvedValue(0);
    await expect(
      service.expire(RedisNamespace.CACHE, 'missing', 30),
    ).resolves.toBe(false);

    await expect(service.exists(RedisNamespace.BLACKLIST, 'jti')).resolves.toBe(
      true,
    );
  });

  it('atomically enforces a rolling-window rate limit', async () => {
    await expect(
      service.consumeRateLimit(
        RedisNamespace.RATE_LIMIT,
        'notification:user:in_app',
        100,
        3_600_000,
        1_800_000,
        'event-id',
      ),
    ).resolves.toBe(true);
    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('ZREMRANGEBYSCORE', KEYS[1]"),
      1,
      'skillsync:ratelimit:notification:user:in_app',
      1_800_000 - 3_600_000,
      100,
      1_800_000,
      'event-id',
      3_600_000,
    );

    client.eval.mockResolvedValue(0);
    await expect(
      service.consumeRateLimit(
        RedisNamespace.RATE_LIMIT,
        'notification:user:in_app',
        100,
        3_600_000,
        1_800_000,
        'event-id-2',
      ),
    ).resolves.toBe(false);
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
    const controller = new RedisHealthController({
      ping: jest.fn().mockResolvedValue(3),
    } as never);
    await expect(controller.check()).resolves.toEqual({
      status: 'up',
      latencyMs: 3,
    });
  });

  it('answers 503 when Redis does not respond', async () => {
    const controller = new RedisHealthController({
      ping: jest.fn().mockRejectedValue(new Error('timeout')),
    } as never);
    await expect(controller.check()).rejects.toThrow(
      'Redis is not reachable: timeout',
    );
  });
});
