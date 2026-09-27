import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { RedisService } from '../services/redis.service.js';

@Module({
  imports: [TypeOrmModule],
  controllers: [HealthController],
  providers: [HealthService, RedisService],
})
export class HealthModule {}
