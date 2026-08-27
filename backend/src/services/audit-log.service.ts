import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(
    userId: string,
    action: string,
    entityType: string,
    entityId?: string | null,
    details?: Record<string, any> | null,
  ): Promise<AuditLog> {
    const logEntry = this.auditLogRepository.create({
      userId,
      action,
      entityType,
      entityId: entityId ?? null,
      details: details ?? null,
    });
    return this.auditLogRepository.save(logEntry);
  }

  async getLogsForUser(userId: string): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
