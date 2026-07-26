import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WalletStrategy } from './strategies/wallet.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TokenBlacklistService } from './services/token-blacklist.service';

/**
 * #971: Self-contained Auth module.
 *
 * Exports guards and strategies for use in other modules.
 * Handles wallet authentication, JWT lifecycle, session management, and RBAC.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET', 'dev-secret'),
        signOptions: {
          expiresIn: configService.get('JWT_ACCESS_TTL', '900'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, WalletStrategy, JwtAuthGuard, RolesGuard, TokenBlacklistService],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule, TokenBlacklistService],
})
export class AuthModule {}
