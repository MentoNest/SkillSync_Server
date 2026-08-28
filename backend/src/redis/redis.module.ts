import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Reusable Redis module (#1142).
 *
 * Marked `@Global()` so a single Redis connection/service instance is shared
 * across the whole app without every feature module needing to import it —
 * it's still a perfectly normal module other modules can import explicitly
 * too if that's preferred for clarity.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
