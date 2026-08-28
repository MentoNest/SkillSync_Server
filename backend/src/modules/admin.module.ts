import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { AuditLog } from '../auth/entities/audit-log.entity';
import { Role } from '../entities/role.entity';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminController } from '../controllers/admin.controller';
import { UserModule } from '../user/user.module';

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
