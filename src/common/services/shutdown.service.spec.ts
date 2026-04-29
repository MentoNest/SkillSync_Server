import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ShutdownService } from './shutdown.service';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '../../config/config.service';
import { DataSource } from 'typeorm';

describe('ShutdownService', () => {
  let service: ShutdownService;
  let redisService: RedisService;
  let configService: ConfigService;
  let dataSource: DataSource;

  const mockRedisService = {
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue({ status: 'healthy', responseTime: '1ms' }),
  };

  const mockConfigService = {
    shutdownTimeout: 5000, // 5 seconds for tests
  };

  const mockDataSource = {
    isInitialized: true,
    destroy: jest.fn().mockResolvedValue(undefined),
  };

  const mockHttpServer = {
    close: jest.fn().mockImplementation((callback) => callback()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock process.exit
    jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShutdownService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ShutdownService>(ShutdownService);
    redisService = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);
    dataSource = module.get<DataSource>(DataSource);

    // Set mock HTTP server
    service.setHttpServer(mockHttpServer as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isShuttingDownState', () => {
    it('should return false initially', () => {
      expect(service.isShuttingDownState()).toBe(false);
    });

    it('should return true after shutdown is initiated', async () => {
      // Start shutdown but don't await it
      service.gracefulShutdown('SIGTERM');
      
      // Should be shutting down
      expect(service.isShuttingDownState()).toBe(true);
    });
  });

  describe('gracefulShutdown', () => {
    it('should stop accepting new connections', async () => {
      await service.gracefulShutdown('SIGTERM');

      expect(mockHttpServer.close).toHaveBeenCalled();
    });

    it('should close database connections', async () => {
      await service.gracefulShutdown('SIGTERM');

      expect(mockDataSource.destroy).toHaveBeenCalled();
    });

    it('should close Redis connections', async () => {
      await service.gracefulShutdown('SIGTERM');

      expect(mockRedisService.onModuleDestroy).toHaveBeenCalled();
    });

    it('should exit with code 0 on successful shutdown', async () => {
      await service.gracefulShutdown('SIGTERM');

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should handle shutdown with SIGINT signal', async () => {
      await service.gracefulShutdown('SIGINT');

      expect(mockHttpServer.close).toHaveBeenCalled();
      expect(mockDataSource.destroy).toHaveBeenCalled();
      expect(mockRedisService.onModuleDestroy).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should not shutdown twice if already shutting down', async () => {
      // Start first shutdown
      const promise1 = service.gracefulShutdown('SIGTERM');
      
      // Try to start second shutdown
      await service.gracefulShutdown('SIGTERM');

      // HTTP server should only be closed once
      expect(mockHttpServer.close).toHaveBeenCalledTimes(1);
      
      await promise1;
    });

    it('should handle database close errors gracefully', async () => {
      mockDataSource.destroy.mockRejectedValueOnce(new Error('DB close failed'));

      await service.gracefulShutdown('SIGTERM');

      // Should still exit successfully even if DB close fails
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should handle Redis close errors gracefully', async () => {
      mockRedisService.onModuleDestroy.mockRejectedValueOnce(new Error('Redis close failed'));

      await service.gracefulShutdown('SIGTERM');

      // Should still exit successfully even if Redis close fails
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should force exit after timeout', async () => {
      // Mock HTTP server close to never call callback (simulating hanging connections)
      mockHttpServer.close.mockImplementation(() => {
        // Never calls callback - simulates hanging connections
      });

      // Create a new service with very short timeout
      const shortTimeoutConfig = {
        shutdownTimeout: 100, // 100ms timeout for testing
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ShutdownService,
          { provide: RedisService, useValue: mockRedisService },
          { provide: ConfigService, useValue: shortTimeoutConfig },
          { provide: DataSource, useValue: mockDataSource },
        ],
      }).compile();

      const newService = module.get<ShutdownService>(ShutdownService);
      newService.setHttpServer(mockHttpServer as any);

      await newService.gracefulShutdown('SIGTERM');

      // Should force exit with code 1 after timeout
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('should trigger graceful shutdown', async () => {
      await service.onModuleDestroy();

      expect(mockHttpServer.close).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should not shutdown twice if already shutting down', async () => {
      // Start shutdown
      await service.gracefulShutdown('SIGTERM');
      
      // Try onModuleDestroy
      await service.onModuleDestroy();

      // Should only close once
      expect(mockHttpServer.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('setHttpServer', () => {
    it('should set the HTTP server reference', () => {
      const newMockServer = { close: jest.fn() };
      service.setHttpServer(newMockServer as any);

      expect(service).toBeDefined();
    });
  });
});
