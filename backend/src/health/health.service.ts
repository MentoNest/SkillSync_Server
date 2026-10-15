import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service.js';

export interface HealthComponent {
  name: 'database' | 'redis';
  status: 'healthy' | 'unhealthy';
  responseTimeMs: number;
  details?: string;
}

export interface HealthReport {
  status: 'healthy' | 'degraded';
  timestamp: string;
  components: HealthComponent[];
}

/**
 * Aggregates connectivity checks for every backing service (#1422).
 * Each component is measured independently so one outage still reports the
 * health of the others.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const components = [database, redis];
    const healthy = components.every((c) => c.status === 'healthy');

    return {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      components,
    };
  }

  private async checkDatabase(): Promise<HealthComponent> {
    const startedAt = performance.now();
    try {
      if (!this.dataSource.isInitialized) {
        throw new Error('connection not initialized');
      }
      await this.dataSource.query('SELECT 1');
      return {
        name: 'database',
        status: 'healthy',
        responseTimeMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        responseTimeMs: Math.round(performance.now() - startedAt),
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkRedis(): Promise<HealthComponent> {
    const startedAt = performance.now();
    const healthy = await this.redisService.isHealthy();
    return {
      name: 'redis',
      status: healthy ? 'healthy' : 'unhealthy',
      responseTimeMs: Math.round(performance.now() - startedAt),
      details: healthy ? undefined : 'PING failed — not connected',
    };
  }
}
