import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '../redis/redis.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_CONFIG, buildAuthConfig } from './auth.types';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { WalletAuthGuard } from './guards/wallet-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WalletStrategy } from './strategies/wallet.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), RedisModule],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => buildAuthConfig((key) => process.env[key]) },
    AuthService,
    JwtStrategy,
    WalletStrategy,
    JwtAuthGuard,
    RolesGuard,
    WalletAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard, WalletAuthGuard, JwtStrategy, WalletStrategy],
})
export class AuthModule {}
