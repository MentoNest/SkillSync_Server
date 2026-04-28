import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
    private dataSource: DataSource,
  ) {}

  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get('NODE_ENV'),
    };
  }

  async checkDetailed() {
    const redisHealth = await this.checkRedis();
    const databaseHealth = await this.checkDatabase();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get('NODE_ENV'),
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
