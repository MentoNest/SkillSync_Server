import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RedisModule } from './redis/redis.module';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { UserService } from './auth/user.service';
import { LoginAttemptService } from './auth/login-attempt.service';
import { AuditLogService } from './auth/audit-log.service';
 feat/refresh-token
import { RefreshTokenService } from './refresh-token/refresh-token.service';
import { EncryptionModule } from './common/encryption/encryption.module';
import { UserEncryptionSubscriber } from './common/encryption/user-encryption.subscriber';
 main

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    RedisModule,
 feat/refresh-token
    TypeOrmModule.forFeature([User, RefreshToken]),
    EncryptionModule,
    TypeOrmModule.forFeature([User]),
 main
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const algorithm = config.get('JWT_ALGORITHM') || (config.get('JWT_PRIVATE_KEY') ? 'RS256' : 'HS256');
        const secretOrKey = algorithm === 'RS256' ? config.get<string>('JWT_PUBLIC_KEY') : config.get<string>('JWT_SECRET');
        if (!secretOrKey) {
          throw new Error('JWT_SECRET or JWT_PUBLIC_KEY must be configured');
        }

        return {
          secret: secretOrKey,
          signOptions: {
            algorithm,
            expiresIn: config.get('JWT_ACCESS_EXPIRATION', '15m'),
            issuer: config.get('JWT_ISSUER', 'SkillSync'),
            audience: config.get('JWT_AUDIENCE', 'SkillSync'),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
 feat/refresh-token
  providers: [
    AuthService,
    JwtStrategy,
    UserService,
    LoginAttemptService,
    AuditLogService,
    RefreshTokenService,
  ],
  exports: [AuthService, RefreshTokenService],
  providers: [AuthService, JwtStrategy, UserService, LoginAttemptService, AuditLogService, UserEncryptionSubscriber],
  exports: [AuthService],
 main
})
export class AuthModule {}