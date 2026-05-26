import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import redisConfig from './redis.config';
import { RedisService } from './redis.service';
import { RedisHealthIndicator } from './redis.health';

@Module({
  imports: [ConfigModule.forFeature(redisConfig)],
  providers: [RedisService, RedisHealthIndicator],
  exports: [RedisService, RedisHealthIndicator],
})
export class RedisModule {}
