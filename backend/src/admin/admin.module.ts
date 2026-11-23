import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { PaginationService } from '../common/pagination/pagination.service';
import { RoleEntity } from '../user/role.entity';
import { User } from '../user/user.entity';
import { UserModule } from '../user/user.module';
import { AdminController, ReportsController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminSession } from './entities/admin-session.entity';
import { ContentReport } from './entities/content-report.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RoleEntity,
      ContentReport,
      AdminSession,
      AuditLog,
    ]),
    AuthModule,
    UserModule,
    AuditModule,
  ],
  controllers: [AdminController, ReportsController],
  providers: [AdminService, PaginationService],
  exports: [AdminService],
})
export class AdminModule {}
