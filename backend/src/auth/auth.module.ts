import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogService } from './audit-log.service';
import { AdminAccessGuard } from './admin-access.guard';
import { AuditLog } from './entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

import { JwtStrategy } from './strategies/jwt.strategy';
import { WalletStrategy } from './strategies/wallet.strategy';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([RefreshToken]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,

    /**
     * Guards
     */
    JwtAuthGuard,
    RolesGuard,

    /**
     * Strategies
     */
    JwtStrategy,
    WalletStrategy,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    JwtStrategy,
    WalletStrategy,
  ],
  imports: [ConfigModule, TypeOrmModule.forFeature([RefreshToken, AuditLog])],
  controllers: [AuthController, AuditLogsController],
  providers: [AuthService, AuditLogService, AdminAccessGuard],
  exports: [AuthService],
})
export class AuthModule {}