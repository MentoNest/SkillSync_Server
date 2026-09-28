import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { AuditLog } from './entities/audit-log.entity.js';
import { RedisService } from './services/redis.service.js';
import { NotificationService } from './services/notification.service.js';
import { SuspiciousDetectionService } from './services/suspicious-detection.service.js';
import { RevokeAllRateLimitGuard } from './guards/revoke-all-rate-limit.guard.js';
import { NonceRateLimitGuard } from './guards/nonce-rate-limit.guard.js';
import { WalletLoginRateLimitGuard } from './guards/wallet-login-rate-limit.guard.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { WalletStrategy } from './strategies/wallet.strategy.js';
import { UserModule } from '../user/user.module.js';
import { User } from '../user/entities/user.entity.js';
import { UserSuspension } from '../user/entities/user-suspension.entity.js';
import { Role } from '../entities/role.entity.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';

@Module({
  imports: [
    // #1175: UserSuspension registered here too since RolesGuard is
    // provided both here and in UserModule (each module resolves its own
    // instance's dependencies from its own imports).
    TypeOrmModule.forFeature([RefreshToken, AuditLog, User, Role, UserSuspension]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '1d' },
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    forwardRef(() => UserModule),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RedisService,
    NotificationService,
    SuspiciousDetectionService,
    // #1313: wallet challenge lifecycle.
    NonceService,
    // #1315, #1316: token contract and refresh rotation.
    AccessTokenService,
    RefreshTokenService,
    JwtStrategy,
    WalletStrategy,
    JwtAuthGuard,
    RolesGuard,
    RevokeAllRateLimitGuard,
    NonceRateLimitGuard,
    WalletLoginRateLimitGuard,
  ],
  exports: [
    AuthService,
    RedisService,
    NotificationService,
    SuspiciousDetectionService,
    NonceService,
    AccessTokenService,
    RefreshTokenService,
    WalletStrategy,
    JwtAuthGuard,
    RolesGuard,
    TypeOrmModule,
  ],
})
export class AuthModule {}
