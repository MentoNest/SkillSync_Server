import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { AppConfigService } from '../config/app-config.service';

describe('RedisService', () => {
  let service: RedisService;
  let configService: AppConfigService;

  const mockRedisClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    exists: jest.fn(),
    keys: jest.fn(),
    incr: jest.fn(),
    decr: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    on: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: '',
        REDIS_DB: 0,
        REDIS_KEY_PREFIX: 'skillsync:test',
        REDIS_CONNECT_TIMEOUT: 10000,
      };
      return config[key];
    }),
    getRedisConfig: jest.fn().mockReturnValue({
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0,
      keyPrefix: 'skillsync:test',
      connectTimeout: 10000,
    }),
    isDevelopment: jest.fn().mockReturnValue(true),
    isProduction: jest.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
      ],
    })
      .overrideProvider(RedisService)
      .useValue({
        ...mockRedisClient,
        get: mockRedisClient.get,
        set: mockRedisClient.set,
        del: mockRedisClient.del,
        expire: mockRedisClient.expire,
        exists: mockRedisClient.exists,
        keys: mockRedisClient.keys,
        ping: mockRedisClient.ping,
      })
      .compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<AppConfigService>(AppConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return value for given key', async () => {
      mockRedisClient.get.mockResolvedValue('test-value');
      
      const result = await service.get('test-key');
      
      expect(result).toBe('test-value');
    });

    it('should return null for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await service.get('non-existent');
      
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value without TTL', async () => {
      await service.set('test-key', 'test-value');
      
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'skillsync:test:test-key',
        'test-value',
      );
    });

    it('should set value with TTL', async () => {
      await service.set('test-key', 'test-value', 3600);
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'skillsync:test:test-key',
        3600,
        'test-value',
      );
    });
  });

  describe('del', () => {
    it('should delete key and return count', async () => {
      mockRedisClient.del.mockResolvedValue(1);
      
      const result = await service.del('test-key');
      
      expect(result).toBe(1);
      expect(mockRedisClient.del).toHaveBeenCalledWith('skillsync:test:test-key');
    });
  });

  describe('expire', () => {
    it('should set expiration and return true', async () => {
      mockRedisClient.expire.mockResolvedValue(1);
      
      const result = await service.expire('test-key', 3600);
      
      expect(result).toBe(true);
    });

    it('should return false if key does not exist', async () => {
      mockRedisClient.expire.mockResolvedValue(0);
      
      const result = await service.expire('test-key', 3600);
      
      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true if key exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1);
      
      const result = await service.exists('test-key');
      
      expect(result).toBe(true);
    });

    it('should return false if key does not exist', async () => {
      mockRedisClient.exists.mockResolvedValue(0);
      
      const result = await service.exists('test-key');
      
      expect(result).toBe(false);
    });
  });

  describe('ping', () => {
    it('should return healthy status when ping succeeds', async () => {
      const result = await service.ping();
      
      expect(result.status).toBe('healthy');
      expect(result.responseTime).toMatch(/\d+ms/);
    });
  });
});
