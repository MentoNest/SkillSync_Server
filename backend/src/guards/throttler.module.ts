import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { ThrottlerGuard } from './throttler.guard.js';
import { RedisService } from '../services/redis.service.js';

/**
 * Wires the generic `@Throttle()` rate limiter into the application.
 *
 * `ThrottlerGuard` and the `Throttle` decorator previously existed but were
 * never registered, so no route was ever actually throttled by them. This
 * module publishes the guard as a global `APP_GUARD`, which activates the
 * per-route `@Throttle(limit, ttl)` overrides where present and the global
 * defaults (100/min authenticated, 20/min unauthenticated) everywhere else.
 *
 * `RedisService` is provided and exported here because the guard depends on it
 * for its sliding-window counters; other modules that want the same instance
 * (e.g. to blacklist tokens) can import this module.
 */
@Module({
  providers: [
    RedisService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [RedisService],
})
export class ThrottlerModule {}
