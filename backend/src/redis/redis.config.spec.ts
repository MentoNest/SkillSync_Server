import {
  buildKey,
  buildRedisConfig,
  DEFAULT_CONNECT_TIMEOUT_MS,
  reconnectDelay,
  RedisNamespace,
} from './redis.config';

const reader = (env: Record<string, string>) => (key: string) => env[key];

describe('buildRedisConfig', () => {
  it('has local defaults, including the 10 second connection timeout', () => {
    expect(buildRedisConfig(reader({}))).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
      connectTimeout: DEFAULT_CONNECT_TIMEOUT_MS,
      keyPrefix: 'skillsync:',
    });
    expect(DEFAULT_CONNECT_TIMEOUT_MS).toBe(10_000);
  });

  it('reads host, port, password, db index, timeout and prefix from the environment', () => {
    expect(
      buildRedisConfig(
        reader({
          REDIS_HOST: 'redis.internal',
          REDIS_PORT: '6380',
          REDIS_PASSWORD: 'secret',
          REDIS_DB: '2',
          REDIS_CONNECT_TIMEOUT_MS: '3000',
          REDIS_KEY_PREFIX: 'app:',
        }),
      ),
    ).toEqual({
      host: 'redis.internal',
      port: 6380,
      password: 'secret',
      db: 2,
      connectTimeout: 3000,
      keyPrefix: 'app:',
    });
  });

  it('treats an empty password as none and rejects invalid numbers', () => {
    expect(
      buildRedisConfig(reader({ REDIS_PASSWORD: '' })).password,
    ).toBeUndefined();
    expect(() => buildRedisConfig(reader({ REDIS_PORT: 'abc' }))).toThrow(
      'REDIS_PORT',
    );
    expect(() => buildRedisConfig(reader({ REDIS_DB: '-1' }))).toThrow(
      'REDIS_DB',
    );
  });
});

describe('reconnectDelay', () => {
  it('backs off by 200 ms per attempt and caps at 5 seconds', () => {
    expect(reconnectDelay(1)).toBe(200);
    expect(reconnectDelay(5)).toBe(1000);
    expect(reconnectDelay(25)).toBe(5000);
    expect(reconnectDelay(1000)).toBe(5000);
  });
});

describe('buildKey', () => {
  it('namespaces keys so concerns do not collide', () => {
    expect(buildKey('skillsync:', RedisNamespace.SESSION, 'abc')).toBe(
      'skillsync:session:abc',
    );
    expect(buildKey('skillsync:', RedisNamespace.CACHE, 'abc')).toBe(
      'skillsync:cache:abc',
    );
    expect(buildKey('skillsync:', RedisNamespace.CACHE, 'abc')).not.toBe(
      buildKey('skillsync:', RedisNamespace.BLACKLIST, 'abc'),
    );
  });
});
