import { Global, Module } from '@nestjs/common';
import { RedisService } from '../services/redis.service';
import { TokenBlacklistService } from './token-blacklist.service';

/**
 * #1317: shared security infrastructure.
 *
 * Marked `@Global()` so the token blacklist is injectable from every feature
 * module (the JWT guard checks it, the logout service writes to it) without each
 * module having to import anything.
 */
@Global()
@Module({
  providers: [RedisService, TokenBlacklistService],
  exports: [RedisService, TokenBlacklistService],
})
export class SecurityModule {}
