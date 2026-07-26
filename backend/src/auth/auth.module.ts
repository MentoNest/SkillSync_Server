import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WalletStrategy } from './strategies/wallet.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { jwtModuleConfig } from '../config/jwt.config.js';

/**
 * #971: Self-contained Auth module.
 *
 * Exports guards and strategies for use in other modules.
 * Handles wallet authentication, JWT lifecycle, session management, and RBAC.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync(jwtModuleConfig),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, WalletStrategy, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
