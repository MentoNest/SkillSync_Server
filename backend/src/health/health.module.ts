import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '../guards/throttler.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [TypeOrmModule, ThrottlerModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
