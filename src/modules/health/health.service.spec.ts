import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { DataSource } from 'typeorm';

const mockConfigService = {
  get: jest.fn().mockReturnValue('test'),
};

const mockRedisService = {
  ping: jest.fn(),
};

const mockDataSource = {
  query: jest.fn(),
  isInitialized: true,
};

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    jest.spyOn(service as any, 'checkDisk').mockResolvedValue({
      status: 'healthy',
      responseTime: '1ms',
      total: '0K',
      used: '0K',
      available: '0K',
      usagePercent: '0%',
      mountpoint: '/',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns healthy status when database and redis are healthy', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ '1': 1 }]);
    mockRedisService.ping.mockResolvedValueOnce({ status: 'healthy', responseTime: '2ms' });

    const result = await service.checkDetailed();

    expect(result.status).toBe('healthy');
    expect(result.services.database.status).toBe('healthy');
    expect(result.services.redis.status).toBe('healthy');
    expect(result.disk.status).toBe('healthy');
    expect(result.timestamp).toBeDefined();
    expect(result.memory).toBeDefined();
  });

  it('returns unhealthy status when the database check fails', async () => {
    mockDataSource.query.mockRejectedValueOnce(new Error('Database down'));
    mockRedisService.ping.mockResolvedValueOnce({ status: 'healthy', responseTime: '1ms' });

    const result = await service.checkDetailed();

    expect(result.status).toBe('unhealthy');
    expect(result.services.database.status).toBe('unhealthy');
    expect(result.services.redis.status).toBe('healthy');
    expect(result.services.database.error).toBe('Database down');
  });

  it('returns unhealthy status when the redis check fails', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ '1': 1 }]);
    mockRedisService.ping.mockResolvedValueOnce({ status: 'unhealthy', responseTime: '5ms' });

    const result = await service.checkDetailed();

    expect(result.status).toBe('unhealthy');
    expect(result.services.database.status).toBe('healthy');
    expect(result.services.redis.status).toBe('unhealthy');
  });
});
