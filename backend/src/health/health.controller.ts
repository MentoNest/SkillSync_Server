import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { RedisHealthIndicator } from '../redis/redis.health';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly redis: RedisHealthIndicator,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  @HealthCheck()
  async check() {
    return this.health.check([
      async () => {
        await this.dataSource.query('SELECT 1');
        return { database: { status: 'up' } };
      },
      () => this.redis.isHealthy('redis'),
      async () => ({ memory: { status: 'up', heapUsed: process.memoryUsage().heapUsed } }),
    ]);
  }
}
