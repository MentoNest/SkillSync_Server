import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity.js';
import { AuditLog } from '../auth/entities/audit-log.entity.js';
import { Role } from '../entities/role.entity.js';
import { AdminDashboardService } from '../services/admin-dashboard.service.js';
import { AdminController } from '../controllers/admin.controller.js';
import { UserModule } from '../user/user.module.js';

@Module({
  // UserModule exports UserService, which AdminDashboardService delegates
  // account lifecycle (soft delete/restore/status/suspension) actions to,
  // keeping a single source of truth for that logic.
  imports: [TypeOrmModule.forFeature([User, AuditLog, Role]), UserModule],
  controllers: [AdminController],
  providers: [AdminDashboardService],
  exports: [AdminDashboardService],
})
export class AdminModule {}
