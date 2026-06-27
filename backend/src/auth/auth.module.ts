import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogsController } from './audit-logs.controller';
import { AuditLogService } from './audit-log.service';
import { AdminAccessGuard } from './admin-access.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { NonceProvider } from './providers/nonce.provider';
import { SuspensionService } from './suspension.service';
import { SuspiciousLoginService } from './suspicious-login.service';

import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/entities/role.entity';
import { UserSuspension } from '../users/entities/user-suspension.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([RefreshToken, User, Role, UserSuspension])],
  controllers: [AuditLogsController],
  providers: [
    AuditLogService,
    AdminAccessGuard,
    JwtAuthGuard,
    RolesGuard,
    NonceProvider,
    SuspensionService,
    SuspiciousLoginService,
  ],
  exports: [AuditLogService, JwtAuthGuard, RolesGuard, SuspensionService],
})
export class AuthModule {}
