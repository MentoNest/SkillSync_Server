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
import { ConfigService } from '../../config/config.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    RedisModule,
    UserModule,
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.jwtSecret,
        signOptions: {
          expiresIn: configService.jwtExpiresIn,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, NonceService, CacheService, JwtStrategy],
  exports: [NonceService, AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
