import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RateLimitService } from './rate-limit.service';
import { RedisModule } from '../../modules/redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [CacheService, RateLimitService],
  exports: [CacheService, RateLimitService],
})
export class CacheModule {}
