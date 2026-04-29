import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import { ConfigService } from '../../config/config.service';
import { RedisService } from '../../redis/redis.service';
import { DataSource } from 'typeorm';
import { ShutdownService } from '../../common/services/shutdown.service';

describe('HealthService - Shutdown Behavior', () => {
  let service: HealthService;
  let shutdownService: ShutdownService;

  const mockShutdownService = {
    isShuttingDownState: jest.fn().mockReturnValue(false),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('development'),
  };

  const mockRedisService = {
    ping: jest.fn().mockResolvedValue({ status: 'healthy', responseTime: '1ms' }),
  };

  const mockDataSource = {
    isInitialized: true,
    query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ShutdownService, useValue: mockShutdownService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    shutdownService = module.get<ShutdownService>(ShutdownService);
  });

  describe('check', () => {
    it('should return healthy status when not shutting down', () => {
      mockShutdownService.isShuttingDownState.mockReturnValue(false);

      const result = service.check();

      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: 'development',
      });
    });

    it('should throw 503 when shutting down', () => {
      mockShutdownService.isShuttingDownState.mockReturnValue(true);

      expect(() => service.check()).toThrow(ServiceUnavailableException);

      try {
        service.check();
      } catch (error: any) {
        expect(error.response).toEqual({
          status: 'shutting_down',
          message: 'Service is shutting down. Please try again later.',
          timestamp: expect.any(String),
        });
        expect(error.status).toBe(503);
      }
    });
  });

  describe('checkDetailed', () => {
    it('should return detailed health when not shutting down', async () => {
      mockShutdownService.isShuttingDownState.mockReturnValue(false);

      const result = await service.checkDetailed();

      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: 'development',
        version: expect.any(String),
        memory: expect.any(Object),
        system: {
          platform: expect.any(String),
          nodeVersion: expect.any(String),
        },
        services: {
          database: {
            status: 'healthy',
            responseTime: expect.any(String),
            connections: {
              master: 'connected',
            },
          },
          redis: {
            status: 'healthy',
            responseTime: '1ms',
          },
        },
      });
    });

    it('should throw 503 when shutting down', async () => {
      mockShutdownService.isShuttingDownState.mockReturnValue(true);

      await expect(service.checkDetailed()).rejects.toThrow(ServiceUnavailableException);

      try {
        await service.checkDetailed();
      } catch (error: any) {
        expect(error.response).toEqual({
          status: 'shutting_down',
          message: 'Service is shutting down. Please try again later.',
          timestamp: expect.any(String),
          services: {
            database: { status: 'shutting_down' },
            redis: { status: 'shutting_down' },
          },
        });
        expect(error.status).toBe(503);
      }
    });
  });
});
