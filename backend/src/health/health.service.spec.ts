import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthService } from './health.service';
import { RedisService } from '../services/redis.service';

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
  });

  it('should return unhealthy when database is down', async () => {
    mockDataSource.query.mockRejectedValue(new Error('Connection refused'));

    const result = await service.check();
    expect(result.status).toBe('unhealthy');
    const dbComponent = result.components.find((c) => c.name === 'database');
    expect(dbComponent?.status).toBe('unhealthy');
    expect(dbComponent?.details).toContain('Connection refused');
  });

  it('should return healthy when Redis is unavailable (in-memory fallback)', async () => {
    mockRedisService.getClient.mockReturnValue(null);

    const result = await service.check();
    const redisComponent = result.components.find((c) => c.name === 'redis');
    expect(redisComponent?.status).toBe('healthy');
    expect(redisComponent?.details).toContain('in-memory fallback');
  });

  it('should include memory component in result', async () => {
    const result = await service.check();
    const memComponent = result.components.find((c) => c.name === 'memory');
    expect(memComponent).toBeDefined();
    expect(memComponent?.status).toBe('healthy');
    expect(memComponent?.details).toBeDefined();
  });
});
