import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import type { DataSource } from 'typeorm';
import { REDIS } from '../redis/redis.module';

export type ComponentStatus = 'up' | 'down' | 'skipped';

export interface ComponentHealth {
  status: ComponentStatus;
  latencyMs?: number;
  message?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'error';
  uptimeSeconds: number;
  timestamp: string;
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
    memory: ComponentHealth;
  };
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
    @Optional() @Inject(REDIS) private readonly redis?: Redis,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async check(): Promise<{ report: HealthReport; httpStatus: number }> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const memory = this.checkMemory();

    const criticalDown =
      database.status === 'down' || redis.status === 'down';

    const report: HealthReport = {
      status: criticalDown ? 'error' : 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      components: { database, redis, memory },
    };

    return { report, httpStatus: criticalDown ? 503 : 200 };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    if (!this.dataSource?.isInitialized) {
      return { status: 'skipped', message: 'DataSource not configured' };
    }
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'database query failed',
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    if (!this.redis) {
      return { status: 'skipped', message: 'Redis not configured' };
    }
    const start = Date.now();
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        return {
          status: 'down',
          latencyMs: Date.now() - start,
          message: `unexpected PING response: ${pong}`,
        };
      }
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'redis ping failed',
      };
    }
  }

  private checkMemory(): ComponentHealth {
    const usage = process.memoryUsage();
    const heapUsedMb = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(usage.heapTotal / 1024 / 1024);
    return {
      status: 'up',
      message: `heap ${heapUsedMb}/${heapTotalMb} MB`,
    };
  }
}
