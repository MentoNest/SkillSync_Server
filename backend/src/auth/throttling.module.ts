import { Global, Module } from '@nestjs/common';

import { SlidingWindowProvider } from './providers/sliding-window.provider';

import { RedisThrottlerGuard } from './guards/redis-throttler.guard';

@Global()
@Module({
  providers: [
    SlidingWindowProvider,
    RedisThrottlerGuard,
  ],
  exports: [
    SlidingWindowProvider,
    RedisThrottlerGuard,
  ],
})
export class ThrottlingModule {}