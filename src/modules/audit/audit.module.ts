import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './providers/audit.service';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService, RolesGuard],
})
export class AuditModule {}
