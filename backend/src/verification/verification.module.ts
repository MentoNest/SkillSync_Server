import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationBadge } from './entities/verification-badge.entity.js';
import { VerificationAuditLog } from './entities/verification-audit-log.entity.js';
import { VerificationService } from './verification.service.js';
import { VerificationController } from './verification.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([VerificationBadge, VerificationAuditLog])],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
