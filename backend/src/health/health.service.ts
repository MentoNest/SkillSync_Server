import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../services/redis.service.js';

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

const DEPENDENCY_TIMEOUT_MS = 75;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

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
      uptime: process.uptime(),
      components,
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    return this.checkDependency('database', () =>
      this.dataSource.query('SELECT 1'),
    );
  }

  private async checkRedis(): Promise<ComponentStatus> {
    const client = this.redisService.getClient();
    if (!client) {
      return {
        name: 'redis',
        status: 'unhealthy',
        responseTimeMs: 0,
        details: 'Redis client is not connected',
      };
    }
    return this.checkDependency('redis', async () => {
      const result = await client.ping();
      if (result !== 'PONG') {
        throw new Error('Unexpected Redis PING response');
      }
    });
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

  private async checkDependency(
    name: 'database' | 'redis',
    check: () => Promise<unknown>,
  ): Promise<ComponentStatus> {
    const startedAt = performance.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        check(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Dependency check timed out')),
            DEPENDENCY_TIMEOUT_MS,
          );
        }),
      ]);
      return {
        name,
        status: 'healthy',
        responseTimeMs: Math.round(performance.now() - startedAt),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`${name} health check failed: ${message}`);
      return {
        name,
        status: 'unhealthy',
        responseTimeMs: Math.round(performance.now() - startedAt),
        details:
          message === 'Dependency check timed out'
            ? `Check timed out after ${DEPENDENCY_TIMEOUT_MS}ms`
            : `${name} check failed`,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
