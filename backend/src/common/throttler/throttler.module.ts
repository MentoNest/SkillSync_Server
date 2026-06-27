import { Module } from '@nestjs/common';
import { ThrottlerService } from './throttler.service';
import { ThrottlerGuard } from './throttler.guard';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [ThrottlerService, ThrottlerGuard],
  exports: [ThrottlerService, ThrottlerGuard],
})
export class ThrottlerModule {}
