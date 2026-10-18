import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { HealthModule } from '../health/health.module';
import { RbacModule } from '../rbac/rbac.module';
import { RolesGuard } from '../rbac/roles.guard';
import { SessionsModule } from '../sessions/sessions.module';
import { User } from '../users/entities/user.entity';
import { AdminController, ReportsController } from './admin.controller';
import { AdminService } from './admin.service';
import { ContentReport } from './entities/content-report.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuditLog, ContentReport]),
    SessionsModule,
    RbacModule,
    HealthModule,
  ],
  controllers: [AdminController, ReportsController],
  providers: [AdminService, RolesGuard],
})
export class AdminApiModule {}
