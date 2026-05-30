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

import { AuditLog } from './entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/entities/role.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([RefreshToken, AuditLog, User, Role]),
  ],
  controllers: [AuthController, AuditLogsController],
  providers: [
    AuthService,
    AuditLogService,
    AdminAccessGuard,
    JwtAuthGuard,
    RolesGuard,
    NonceProvider,
  ],
  exports: [AuthService, AuditLogService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
