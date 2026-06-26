import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogService } from './audit-log.service';
import { AdminAccessGuard } from './admin-access.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { NonceProvider } from './providers/nonce.provider';
import { SuspensionService } from './suspension.service';
import { SuspiciousLoginService } from './suspicious-login.service';

import { AuditLog } from './entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/entities/role.entity';
import { UserSuspension } from '../users/entities/user-suspension.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([AuditLog, RefreshToken, User, Role, UserSuspension])],
  controllers: [AuthController, AuditLogsController],
  providers: [
    AuthService,
    AuditLogService,
    AdminAccessGuard,
    JwtAuthGuard,
    RolesGuard,
    NonceProvider,
    SuspensionService,
    SuspiciousLoginService,
  ],
  exports: [AuthService, AuditLogService, JwtAuthGuard, RolesGuard, SuspensionService],
})
export class AuthModule {}
