import { Module, forwardRef } from '@nestjs/common';
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
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { StellarNonceService } from './providers/nonce.service';
import { StellarStrategy } from './strategies/stellar.strategy';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    RedisModule,
    forwardRef(() => AuditModule),
    UserModule,
    MailModule,
    CommonModule,
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
  providers: [
    AuthService,
    NonceService,
    StellarNonceService,
    CacheService,
    RateLimitService,
    JwtStrategy,
    StellarStrategy,
    JwtAuthGuard
  ],
  exports: [NonceService, StellarNonceService, AuthService, JwtStrategy, PassportModule, JwtAuthGuard],
})
export class AuthModule { }
