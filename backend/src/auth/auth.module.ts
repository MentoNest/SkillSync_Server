import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogService } from './audit-log.service';
import { AdminAccessGuard } from './admin-access.guard';
import { AuditLog } from './entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([RefreshToken, AuditLog])],
  controllers: [AuthController, AuditLogsController],
  providers: [AuthService, AuditLogService, AdminAccessGuard],
  exports: [AuthService],
})
export class AuthModule {}
