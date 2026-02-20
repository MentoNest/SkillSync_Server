import { Module } from '@nestjs/common';
import { AuthService } from './providers/auth.service';
import { AuthController } from './auth.controller';
import { NonceService } from '../../common/cache/nonce.service';
import { CacheService } from '../../common/cache/cache.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [AuthController],
  providers: [AuthService, NonceService, CacheService],
  exports: [NonceService],
})
export class AuthModule {}
