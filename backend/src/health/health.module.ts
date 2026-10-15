import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/**
 * Health check module (#1422).
 *
 * Verifies both backing services — PostgreSQL (via TypeORM's DataSource) and
 * Redis (via RedisService) — on `GET /health`.
 */
@Module({
  imports: [TypeOrmModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
