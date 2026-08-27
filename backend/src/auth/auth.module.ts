import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuditLog } from './entities/audit-log.entity';
import { RedisService } from './services/redis.service';
import { NotificationService } from './services/notification.service';
import { SuspiciousDetectionService } from './services/suspicious-detection.service';
import { RevokeAllRateLimitGuard } from './guards/revoke-all-rate-limit.guard';
import { NonceRateLimitGuard } from './guards/nonce-rate-limit.guard';
import { WalletLoginRateLimitGuard } from './guards/wallet-login-rate-limit.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WalletStrategy } from './strategies/wallet.strategy';
import { UserModule } from '../user/user.module';
import { User } from '../user/entities/user.entity';
import { Role } from '../entities/role.entity';
import { RolesGuard } from '../guards/roles.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken, AuditLog, User, Role]),
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
    WalletStrategy,
    JwtAuthGuard,
    RolesGuard,
    TypeOrmModule,
  ],
})
export class AuthModule {}
