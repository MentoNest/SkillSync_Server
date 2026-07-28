import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthService } from './health.service.js';
import { HealthController } from './health.controller.js';
import { RedisModule } from '../config/redis.module.js';

@Module({
  imports: [TypeOrmModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
