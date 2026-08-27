import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual } from 'typeorm';
import { AuditLog, AuditEventType } from '../entities/audit-log.entity';

export interface CreateAuditLogDto {
  userId?: string | null;
  eventType: AuditEventType | string;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, any>;
  isSuspicious?: boolean;
}

export interface QueryAuditLogsDto {
  userId?: string;
  eventType?: string;
  isSuspicious?: boolean;
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);
  private readonly DEFAULT_RETENTION_DAYS = 90;
  private readonly SUSPICIOUS_FAILURE_THRESHOLD = 3;
  private readonly SUSPICIOUS_WINDOW_MINUTES = 5;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Log an authentication or security-related event
   */
  async logEvent(dto: CreateAuditLogDto): Promise<AuditLog> {
    let isSuspicious = dto.isSuspicious ?? false;

    // Detect suspicious activity on login failures (e.g. multiple rapid failures within time window)
    if (dto.eventType === AuditEventType.LOGIN_FAILURE && !isSuspicious) {
      isSuspicious = await this.detectRapidFailures(dto.ipAddress, dto.details?.attemptedWalletAddress);
    }

    const auditLog = this.auditLogRepository.create({
      userId: dto.userId ?? null,
      eventType: dto.eventType,
      ipAddress: dto.ipAddress ?? null,
      userAgent: dto.userAgent ?? null,
      details: dto.details ?? {},
      isSuspicious,
    });

    return this.auditLogRepository.save(auditLog);
  }

  /**
   * Detect multiple rapid failures from IP or attempted wallet address
   */
  private async detectRapidFailures(
    ipAddress?: string | null,
    attemptedWalletAddress?: string,
  ): Promise<boolean> {
    const windowStart = new Date(Date.now() - this.SUSPICIOUS_WINDOW_MINUTES * 60 * 1000);

    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('log')
      .where('log.eventType = :eventType', { eventType: AuditEventType.LOGIN_FAILURE })
      .andWhere('log.timestamp >= :windowStart', { windowStart });

    if (ipAddress && attemptedWalletAddress) {
      queryBuilder.andWhere(
        '(log.ipAddress = :ipAddress OR log.details ::jsonb ->> \'attemptedWalletAddress\' = :wallet)',
        { ipAddress, wallet: attemptedWalletAddress },
      );
    } else if (ipAddress) {
      queryBuilder.andWhere('log.ipAddress = :ipAddress', { ipAddress });
    } else if (attemptedWalletAddress) {
      queryBuilder.andWhere(
        'log.details ::jsonb ->> \'attemptedWalletAddress\' = :wallet',
        { wallet: attemptedWalletAddress },
      );
    } else {
      return false;
    }

    const recentFailureCount = await queryBuilder.getCount();
    // If current failure will reach or exceed threshold
    return recentFailureCount + 1 >= this.SUSPICIOUS_FAILURE_THRESHOLD;
  }

  /**
   * Query audit logs with flexible filters and pagination (Admin only)
   */
  async getLogs(query: QueryAuditLogsDto = {}): Promise<{ logs: AuditLog[]; total: number }> {
    const qb = this.auditLogRepository.createQueryBuilder('log');

    if (query.userId) {
      qb.andWhere('log.userId = :userId', { userId: query.userId });
    }

    if (query.eventType) {
      qb.andWhere('log.eventType = :eventType', { eventType: query.eventType });
    }

    if (typeof query.isSuspicious === 'boolean') {
      qb.andWhere('log.isSuspicious = :isSuspicious', { isSuspicious: query.isSuspicious });
    }

    if (query.startDate) {
      qb.andWhere('log.timestamp >= :startDate', { startDate: new Date(query.startDate) });
    }

    if (query.endDate) {
      qb.andWhere('log.timestamp <= :endDate', { endDate: new Date(query.endDate) });
    }

    qb.orderBy('log.timestamp', 'DESC');

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    qb.take(limit).skip(offset);

    const [logs, total] = await qb.getManyAndCount();
    return { logs, total };
  }

  /**
   * Get single audit log by ID
   */
  async getLogById(id: string): Promise<AuditLog | null> {
    return this.auditLogRepository.findOne({ where: { id } });
  }

  /**
   * Archive and clean up audit logs older than retention period (default: 90 days)
   */
  async archiveAndCleanup(retentionDays: number = this.DEFAULT_RETENTION_DAYS): Promise<{
    archivedCount: number;
    deletedCount: number;
    cutoffDate: Date;
    archivedLogs: AuditLog[];
  }> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Retrieve old logs for archiving
    const oldLogs = await this.auditLogRepository.find({
      where: {
        timestamp: LessThan(cutoffDate),
      },
    });

    const count = oldLogs.length;

    if (count > 0) {
      await this.auditLogRepository.delete({
        timestamp: LessThan(cutoffDate),
      });
      this.logger.log(`Cleaned up ${count} audit logs older than ${retentionDays} days (before ${cutoffDate.toISOString()})`);
    }

    return {
      archivedCount: count,
      deletedCount: count,
      cutoffDate,
      archivedLogs: oldLogs,
    };
  }

  /**
   * Delete logs older than retention period without archiving
   */
  async cleanupOldLogs(retentionDays: number = this.DEFAULT_RETENTION_DAYS): Promise<{
    deletedCount: number;
    cutoffDate: Date;
  }> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const deleteResult = await this.auditLogRepository.delete({
      timestamp: LessThan(cutoffDate),
    });

    return {
      deletedCount: deleteResult.affected ?? 0,
      cutoffDate,
    };
  }
}
