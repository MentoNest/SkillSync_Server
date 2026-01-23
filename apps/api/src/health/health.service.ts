import { Injectable, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../redis/redis.module';
import type { RedisClient } from '../redis/redis.module';
import {
  LivenessResponse,
  ReadinessResponse,
  HealthCheck,
} from './health.interface';

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  /**
   * Returns liveness status - basic app heartbeat
   * This endpoint should pass as long as the process is running
   */
  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Returns readiness status - app + dependencies ready for traffic
   * Checks both DB and Redis connectivity
   */
  async getReadiness(): Promise<ReadinessResponse> {
    const checks = {
      db: await this.checkDb(),
      redis: await this.checkRedis(),
    };

    // Determine overall status based on check results
    const allOk = Object.values(checks).every((check) => check.status === 'ok');
    const anyError = Object.values(checks).some(
      (check) => check.status === 'error',
    );

    let status: 'ok' | 'degraded' | 'error';
    if (anyError) {
      status = 'error';
    } else if (allOk) {
      status = 'ok';
    } else {
      status = 'degraded';
    }

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check database connectivity with a simple query
   */
  private async checkDb(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const error =
        err instanceof Error ? err : new Error('Unknown database error');
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        error: error.message,
      };
    }
  }

  /**
   * Check Redis connectivity with PING command
   */
  private async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const result = await this.redis.ping();
      if (result !== 'PONG') {
        throw new Error('Unexpected Redis PING response');
      }
      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const error =
        err instanceof Error ? err : new Error('Unknown Redis error');
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        error: error.message,
      };
    }
  }
}
