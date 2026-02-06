import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './providers/audit.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
