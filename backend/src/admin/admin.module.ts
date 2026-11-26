import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { PaginationService } from '../common/pagination/pagination.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RoleEntity } from '../user/role.entity';
import { User } from '../user/user.entity';
import { UserModule } from '../user/user.module';
import { AdminController, ReportsController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminSession } from './entities/admin-session.entity';
import { ContentReport } from './entities/content-report.entity';
import { UserSuspension } from './entities/user-suspension.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RoleEntity,
      ContentReport,
      AdminSession,
      AuditLog,
      UserSuspension,
    ]),
    AuthModule,
    UserModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [AdminController, ReportsController],
  providers: [AdminService, PaginationService],
  exports: [AdminService],
})
export class AdminModule {}
