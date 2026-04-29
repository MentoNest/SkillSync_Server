import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { AppConfigService } from '../config/app-config.service';
import { createRedisConfig } from './redis.config';

jest.mock('./redis.config', () => ({
  createRedisConfig: jest.fn().mockResolvedValue({
    url: 'redis://localhost:6379',
  }),
}));

describe('RedisService', () => {
  let service: RedisService;
  let configService: AppConfigService;

  const mockRedisClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue('test-value'),
    set: jest.fn().mockResolvedValue('OK'),
    setEx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue(['key1', 'key2']),
    incr: jest.fn().mockResolvedValue(1),
    decr: jest.fn().mockResolvedValue(0),
    ping: jest.fn().mockResolvedValue('PONG'),
    on: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const config: Record<string, string> = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'redis-password',
        REDIS_DB: '0',
        REDIS_KEY_PREFIX: 'skillsync',
        REDIS_CONNECT_TIMEOUT: '10000',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: AppConfigService, useValue: mockConfigService },
      ],
    })
      .overrideProvider(AppConfigService)
      .useValue(mockConfigService)
      .compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<AppConfigService>(AppConfigService);

    // Mock the client after initialization
    (service as any).client = mockRedisClient;
    (service as any).keyPrefix = 'skillsync';
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize Redis client', async () => {
      const newService = new RedisService(configService);
      
      await newService.onModuleInit();

      expect(createRedisConfig).toHaveBeenCalledWith(configService);
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.connect).toHaveBeenCalled();
      
      await newService.onModuleDestroy();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect Redis client', async () => {
      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should handle missing client gracefully', async () => {
      (service as any).client = null;

      await service.onModuleDestroy();

      expect(mockRedisClient.quit).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should get value from Redis', async () => {
      const result = await service.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('skillsync:test-key');
      expect(result).toBe('test-value');
    });
  });

  describe('getJson', () => {
    it('should get and parse JSON value', async () => {
      mockRedisClient.get.mockResolvedValueOnce('{"name":"test","value":123}');

      const result = await service.getJson('json-key');

      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should return null for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      const result = await service.getJson('missing-key');

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      mockRedisClient.get.mockResolvedValueOnce('invalid-json');

      const result = await service.getJson('invalid-json-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value without TTL', async () => {
      await service.set('test-key', 'test-value');

      expect(mockRedisClient.set).toHaveBeenCalledWith('skillsync:test-key', 'test-value');
    });

    it('should set value with TTL', async () => {
      await service.set('test-key', 'test-value', 3600);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith('skillsync:test-key', 3600, 'test-value');
    });
  });

  describe('setJson', () => {
    it('should set JSON value', async () => {
      const data = { name: 'test', value: 123 };

      await service.setJson('json-key', data);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'skillsync:json-key',
        JSON.stringify(data),
      );
    });

    it('should set JSON value with TTL', async () => {
      const data = { name: 'test' };

      await service.setJson('json-key', data, 1800);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'skillsync:json-key',
        1800,
        JSON.stringify(data),
      );
    });
  });

  describe('del', () => {
    it('should delete key from Redis', async () => {
      const result = await service.del('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('skillsync:test-key');
      expect(result).toBe(1);
    });
  });

  describe('expire', () => {
    it('should set expiration on key', async () => {
      const result = await service.expire('test-key', 3600);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('skillsync:test-key', 3600);
      expect(result).toBe(true);
    });

    it('should return false when expire fails', async () => {
      mockRedisClient.expire.mockResolvedValueOnce(0);

      const result = await service.expire('test-key', 3600);

      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true when key exists', async () => {
      const result = await service.exists('test-key');

      expect(mockRedisClient.exists).toHaveBeenCalledWith('skillsync:test-key');
      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(0);

      const result = await service.exists('missing-key');

      expect(result).toBe(false);
    });
  });

  describe('keys', () => {
    it('should get keys matching pattern', async () => {
      const result = await service.keys('test:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('skillsync:test:*');
      expect(result).toEqual(['key1', 'key2']);
    });
  });

  describe('incr', () => {
    it('should increment value', async () => {
      const result = await service.incr('counter');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('skillsync:counter');
      expect(result).toBe(1);
    });
  });

  describe('decr', () => {
    it('should decrement value', async () => {
      const result = await service.decr('counter');

      expect(mockRedisClient.decr).toHaveBeenCalledWith('skillsync:counter');
      expect(result).toBe(0);
    });
  });

  describe('ping', () => {
    it('should return healthy status when ping succeeds', async () => {
      const result = await service.ping();

      expect(mockRedisClient.ping).toHaveBeenCalled();
      expect(result.status).toBe('healthy');
      expect(result).toHaveProperty('responseTime');
    });

    it('should return unhealthy status when ping fails', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await service.ping();

      expect(result.status).toBe('unhealthy');
      expect(result).toHaveProperty('responseTime');
    });

    it('should return unhealthy for non-PONG response', async () => {
      mockRedisClient.ping.mockResolvedValueOnce('ERROR');

      const result = await service.ping();

      expect(result.status).toBe('unhealthy');
    });
  });

  describe('getClient', () => {
    it('should return Redis client', () => {
      const client = service.getClient();

      expect(client).toBe(mockRedisClient);
    });
  });

  describe('getPrefixedKey', () => {
    it('should add prefix to key', async () => {
      await service.get('my-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('skillsync:my-key');
    });
  });
});
