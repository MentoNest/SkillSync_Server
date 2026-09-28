import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEventType, AuditLog } from '../entities/audit-log.entity.js';

/**
 * #1320: thin, generic audit writer for non-authentication events (profile
 * changes, suspensions, ...). Authentication specific events go through
 * `AuditService`, which additionally flags suspicious activity and owns the
 * retention policy.
 */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * @param userId   actor the event belongs to
   * @param action   event type, ideally one of {@link AuditEventType}
   * @param entityType subject of the event, folded into `details` (the
   *                  `audit_logs` table has no dedicated column for it)
   * @param entityId id of the subject, folded into `details`
   */
  async log(
    userId: string,
    action: AuditEventType | string,
    entityType: string,
    entityId?: string | null,
    details?: Record<string, any> | null,
  ): Promise<AuditLog> {
    const logEntry = this.auditLogRepository.create({
      userId,
      eventType: action,
      details: { ...(details ?? {}), entityType, entityId: entityId ?? null },
    });
    return this.auditLogRepository.save(logEntry);
  }

  async getLogsForUser(userId: string): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { userId },
      order: { timestamp: 'DESC' },
    });
  }
}
