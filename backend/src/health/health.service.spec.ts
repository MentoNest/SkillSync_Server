import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthService } from './health.service.js';
import { RedisService } from '../services/redis.service.js';

describe('HealthService', () => {
  let service: HealthService;
  let mockDataSource: any;
  let mockRedisService: any;

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    mockRedisService = {
      getClient: jest.fn().mockReturnValue({
        ping: jest.fn().mockResolvedValue('PONG'),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should return healthy when all components are up', async () => {
    const result = await service.check();
    expect(result.status).toBe('healthy');
    expect(result.components).toHaveLength(3);
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeDefined();
    expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
    expect(mockRedisService.getClient().ping).toHaveBeenCalled();
  });

  it('should return unhealthy when database is down', async () => {
    mockDataSource.query.mockRejectedValue(new Error('Connection refused'));

    const result = await service.check();
    expect(result.status).toBe('unhealthy');
    const dbComponent = result.components.find((c) => c.name === 'database');
    expect(dbComponent?.status).toBe('unhealthy');
    expect(dbComponent?.details).toBe('database check failed');
  });

  it('should return unhealthy when Redis is unavailable', async () => {
    mockRedisService.getClient.mockReturnValue(null);

    const result = await service.check();
    const redisComponent = result.components.find((c) => c.name === 'redis');
    expect(result.status).toBe('unhealthy');
    expect(redisComponent?.status).toBe('unhealthy');
    expect(redisComponent?.details).toContain('not connected');
  });

  it('should return unhealthy when Redis PING fails', async () => {
    mockRedisService.getClient.mockReturnValue({
      ping: jest.fn().mockRejectedValue(new Error('connection lost')),
    });

    const result = await service.check();
    expect(result.status).toBe('unhealthy');
    expect(result.components.find((component) => component.name === 'redis')?.status).toBe(
      'unhealthy',
    );
  });

  it('should time out slow dependency checks within 100ms', async () => {
    mockDataSource.query.mockImplementation(
      () => new Promise(() => undefined),
    );

    const result = await service.check();
    const database = result.components.find((component) => component.name === 'database');
    expect(result.status).toBe('unhealthy');
    expect(database?.details).toContain('timed out');
    expect(database?.responseTimeMs).toBeLessThan(100);
  });

  it('should include memory component in result', async () => {
    const result = await service.check();
    const memComponent = result.components.find((c) => c.name === 'memory');
    expect(memComponent).toBeDefined();
    expect(memComponent?.status).toBe('healthy');
    expect(memComponent?.details).toBeDefined();
  });
});
