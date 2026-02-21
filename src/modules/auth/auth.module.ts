import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './providers/auth.service';
import { AuthController } from './auth.controller';
import { NonceService } from '../../common/cache/nonce.service';
import { CacheService } from '../../common/cache/cache.service';
import { RedisModule } from '../redis/redis.module';
import { UserModule } from '../user/user.module';
import { MailModule } from '../mail/mail.module';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from '../../common/cache/rate-limit.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    RedisModule,
    AuditModule,
    UserModule,
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'dev-secret-key-for-skill-sync-server'),
        signOptions: {
          expiresIn: 3600, // 1 hour in seconds
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, NonceService, CacheService, RateLimitService, JwtStrategy],
  exports: [NonceService, AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
