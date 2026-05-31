import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '../redis/redis.module';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthService } from './jwt.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const alg = config.get<string>('JWT_SIGNING_ALG') || 'HS256';
        const expiresIn = config.get<string>('JWT_ACCESS_EXPIRATION') || '15m';
        const issuer = config.get<string>('JWT_ISSUER') || 'SkillSync_Server';
        const audience = config.get<string>('JWT_AUDIENCE') || 'skill-sync';
        const secretOrKey =
          alg === 'RS256'
            ? config.get<string>('JWT_PRIVATE_KEY')
            : config.get<string>('JWT_ACCESS_SECRET');

        return {
          secret: secretOrKey,
          signOptions: {
            algorithm: alg as any,
            expiresIn,
            issuer,
            audience,
          },
          verifyOptions: {
            algorithms: [alg],
            issuer,
            audience,
          },
        };
      },
    }),
  ],
  providers: [JwtAuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [JwtAuthService],
})
export class AuthModule {}
