import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

/**
 * Reusable Redis module (#1422).
 *
 * `@Global()` so one connection/service instance is shared application-wide
 * without every feature module importing it; importing it explicitly still
 * works for modules that prefer visible dependencies.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
