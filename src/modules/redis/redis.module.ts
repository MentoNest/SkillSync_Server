import { Module } from '@nestjs/common';
import { RedisService } from './providers/redis.service';
import { RedisController } from './redis.controller';

@Module({
  controllers: [RedisController],
  providers: [RedisService],
})
export class RedisModule {}
