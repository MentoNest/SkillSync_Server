import { Module } from '@nestjs/common';
import { RedisService } from './providers/redis.service';
import { RedisProvider } from './providers/redis.provider';
import { RedisHealthController } from './redis.controller';

@Module({
  controllers: [RedisHealthController],
  providers: [RedisService, RedisProvider],
  exports: [RedisService, RedisProvider],
})
export class RedisModule {}
