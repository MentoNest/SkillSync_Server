import { Module } from '@nestjs/common';
import { AuthService } from './providers/auth.service';
import { AuthController } from './auth.controller';
import { NonceService } from '../../common/cache/nonce.service';
import { CacheService } from '../../common/cache/cache.service';
import { RedisModule } from '../redis/redis.module';
import { UserModule } from '../user/user.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [RedisModule, UserModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, NonceService, CacheService],
  exports: [NonceService, AuthService],
})
export class AuthModule {}
