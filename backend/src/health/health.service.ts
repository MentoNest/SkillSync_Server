import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../services/redis.service';

export interface ComponentStatus {
  name: string;
  status: 'healthy' | 'unhealthy';
  responseTimeMs: number;
  details?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  components: ComponentStatus[];
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const components = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
    ]);

    const allHealthy = components.every((c) => c.status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      components,
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        name: 'database',
        status: 'healthy',
        responseTimeMs: Date.now() - start,
      };
    } catch (error: any) {
      this.logger.error(`Database health check failed: ${error.message}`);
      return {
        name: 'database',
        status: 'unhealthy',
        responseTimeMs: Date.now() - start,
        details: error.message,
      };
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    const start = Date.now();
    const client = this.redisService.getClient();
    if (!client) {
      return {
        name: 'redis',
        status: 'healthy',
        responseTimeMs: 0,
        details: 'Using in-memory fallback (Redis not connected)',
      };
    }
    try {
      const result = await client.ping();
      return {
        name: 'redis',
        status: result === 'PONG' ? 'healthy' : 'unhealthy',
        responseTimeMs: Date.now() - start,
      };
    } catch (error: any) {
      this.logger.warn(`Redis health check failed, using in-memory: ${error.message}`);
      return {
        name: 'redis',
        status: 'healthy',
        responseTimeMs: Date.now() - start,
        details: `Redis unavailable, in-memory fallback active: ${error.message}`,
      };
    }
  }

  private checkMemory(): ComponentStatus {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssUsedMB = Math.round(memUsage.rss / 1024 / 1024);

    return {
      name: 'memory',
      status: 'healthy',
      responseTimeMs: 0,
      details: JSON.stringify({
        heapUsedMB,
        heapTotalMB,
        rssUsedMB,
      }),
    };
  }
}
