import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { RedisService } from '../../redis/redis.service';
import { DataSource } from 'typeorm';
import { ShutdownService } from '../../common/services/shutdown.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
    private dataSource: DataSource,
    private shutdownService: ShutdownService,
  ) {}

  check() {
    // Return 503 if shutting down
    if (this.shutdownService.isShuttingDownState()) {
      throw new ServiceUnavailableException({
        status: 'shutting_down',
        message: 'Service is shutting down. Please try again later.',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.nodeEnv,
    };
  }

  async checkDetailed() {
    // Return 503 if shutting down
    if (this.shutdownService.isShuttingDownState()) {
      throw new ServiceUnavailableException({
        status: 'shutting_down',
        message: 'Service is shutting down. Please try again later.',
        timestamp: new Date().toISOString(),
        services: {
          database: { status: 'shutting_down' },
          redis: { status: 'shutting_down' },
        },
      });
    }

    const redisHealth = await this.checkRedis();
    const databaseHealth = await this.checkDatabase();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.nodeEnv,
      version: process.env.npm_package_version || '1.0.0',
      memory: process.memoryUsage(),
      system: {
        platform: process.platform,
        nodeVersion: process.version,
      },
      services: {
        database: databaseHealth,
        redis: redisHealth,
      },
    };
  }

  private async checkRedis() {
    try {
      const health = await this.redisService.ping();
      return health;
    } catch (error) {
      this.logger.error('Redis health check failed', error.stack);
      return {
        status: 'unhealthy',
        responseTime: '0ms',
        error: error.message,
      };
    }
  }

  private async checkDatabase() {
    const startTime = Date.now();
    
    try {
      // Test database connection with a simple query
      await this.dataSource.query('SELECT 1');
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        connections: {
          master: this.dataSource.isInitialized ? 'connected' : 'disconnected',
        },
      };
    } catch (error) {
      this.logger.error('Database health check failed', error.stack);
      return {
        status: 'unhealthy',
        responseTime: `${Date.now() - startTime}ms`,
        error: error.message,
      };
    }
  }
}
