import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { NonceService } from './nonce.service';
import { RefreshTokenService } from './refresh-token.service';
import { SignatureService } from './signature.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: c.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          issuer: c.get<string>('JWT_ISSUER') ?? 'skillsync',
          audience: c.get<string>('JWT_AUDIENCE') ?? 'skillsync-api',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, NonceService, SignatureService, TokenService, RefreshTokenService],
  exports: [TokenService, RefreshTokenService],
})
export class AuthModule {}
