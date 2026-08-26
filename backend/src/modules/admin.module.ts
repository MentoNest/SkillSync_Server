import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { AuditLog } from '../auth/entities/audit-log.entity';
import { Role } from '../entities/role.entity';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminController } from '../controllers/admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, AuditLog, Role])],
  controllers: [AdminController],
  providers: [AdminDashboardService],
  exports: [AdminDashboardService],
})
export class AdminModule {}
