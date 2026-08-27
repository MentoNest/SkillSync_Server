import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RedisService } from '../services/redis.service';

@Module({
  imports: [TypeOrmModule],
  controllers: [HealthController],
  providers: [HealthService, RedisService],
})
export class HealthModule {}
