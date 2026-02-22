import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { AuditService } from './providers/audit.service';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditLog } from './entities/audit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    forwardRef(() => AuthModule),
  ],
  controllers: [AuditController],
  providers: [AuditService, RolesGuard],
  exports: [AuditService],
})
export class AuditModule {}
