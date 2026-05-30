import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditEventType, AuditLog } from './entities/audit-log.entity';

export type RequestAudit = {
  ipAddress: string | null;
  userAgent: string | string[] | null;
  deviceFingerprint: string | null;
};

type LogEventInput = {
  userId?: string | null;
  eventType: AuditEventType;
  audit: RequestAudit;
  details?: Record<string, unknown>;
  isSuspicious?: boolean;
  timestamp?: Date;
};

type ListAuditLogsFilters = {
  userId?: string;
  eventType?: AuditEventType;
  isSuspicious?: boolean;
  start?: Date;
  end?: Date;
  limit: number;
  offset: number;
};

@Injectable()
export class AuditLogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditLogService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.runRetentionCleanup();
    this.cleanupTimer = setInterval(() => {
      void this.runRetentionCleanup();
    }, this.cleanupIntervalMs);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async logEvent(input: LogEventInput): Promise<AuditLog> {
    return this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: input.userId ?? null,
        eventType: input.eventType,
        timestamp: input.timestamp ?? new Date(),
        ipAddress: input.audit.ipAddress,
        userAgent: this.normalizeHeader(input.audit.userAgent),
        details: input.details ?? {},
        isSuspicious: input.isSuspicious ?? false,
      }),
    );
  }

  async logLoginSuccess(input: {
    userId: string;
    walletAddress?: string | null;
    audit: RequestAudit;
  }): Promise<void> {
    await this.logEvent({
      userId: input.userId,
      eventType: AuditEventType.LOGIN_SUCCESS,
      audit: input.audit,
      details: {
        walletAddress: input.walletAddress ?? null,
      },
    });
  }

  async logLoginFailure(input: {
    attemptedWalletAddress: string;
    userId?: string | null;
    reason?: string;
    audit: RequestAudit;
  }): Promise<void> {
    const failureCountInWindow = await this.countRapidFailures(input);
    const isSuspicious = failureCountInWindow + 1 >= this.suspiciousFailureThreshold;
    await this.logEvent({
      userId: input.userId ?? null,
      eventType: AuditEventType.LOGIN_FAILURE,
      audit: input.audit,
      isSuspicious,
      details: {
        attemptedWalletAddress: input.attemptedWalletAddress,
        reason: input.reason ?? null,
        failureCountInWindow: failureCountInWindow + 1,
      },
    });

    if (isSuspicious) {
      await this.logEvent({
        userId: input.userId ?? null,
        eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
        audit: input.audit,
        isSuspicious: true,
        details: {
          sourceEventType: AuditEventType.LOGIN_FAILURE,
          attemptedWalletAddress: input.attemptedWalletAddress,
          failureCountInWindow: failureCountInWindow + 1,
          threshold: this.suspiciousFailureThreshold,
        },
      });
    }
  }

  async logLogout(input: { userId: string; audit: RequestAudit }): Promise<void> {
    await this.logEvent({
      userId: input.userId,
      eventType: AuditEventType.LOGOUT,
      audit: input.audit,
    });
  }

  async logRefreshTokenUsage(input: {
    userId?: string | null;
    success: boolean;
    reason?: string;
    audit: RequestAudit;
  }): Promise<void> {
    await this.logEvent({
      userId: input.userId ?? null,
      eventType: input.success
        ? AuditEventType.REFRESH_TOKEN_SUCCESS
        : AuditEventType.REFRESH_TOKEN_FAILURE,
      audit: input.audit,
      details: {
        reason: input.reason ?? null,
      },
    });
  }

  async logPasswordEquivalentChange(input: {
    userId: string;
    audit: RequestAudit;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.logEvent({
      userId: input.userId,
      eventType: AuditEventType.PASSWORD_EQUIVALENT_CHANGED,
      audit: input.audit,
      details: input.details,
    });
  }

  async logRoleAssignment(input: {
    userId: string;
    assignedRole: string;
    assignedByUserId?: string;
    audit: RequestAudit;
  }): Promise<void> {
    await this.logEvent({
      userId: input.userId,
      eventType: AuditEventType.ROLE_ASSIGNED,
      audit: input.audit,
      details: {
        assignedRole: input.assignedRole,
        assignedByUserId: input.assignedByUserId ?? null,
      },
    });
  }

  async logUserSuspension(input: {
    userId: string;
    suspendedBy: string;
    reason: string;
    suspendedUntil: string | null;
    audit: RequestAudit;
  }): Promise<void> {
    await this.logEvent({
      userId: input.userId,
      eventType: AuditEventType.SUSPEND_USER,
      audit: input.audit,
      details: {
        suspendedBy: input.suspendedBy,
        reason: input.reason,
        suspendedUntil: input.suspendedUntil,
      },
    });
  }

  async logUserUnsuspension(input: {
    userId: string;
    liftedBy: string;
    audit: RequestAudit;
  }): Promise<void> {
    await this.logEvent({
      userId: input.userId,
      eventType: AuditEventType.UNSUSPEND_USER,
      audit: input.audit,
      details: {
        liftedBy: input.liftedBy,
      },
    });
  }

  async listLogs(filters: ListAuditLogsFilters): Promise<{ items: AuditLog[]; total: number }> {
    const query = this.applyFilters(this.auditLogRepository.createQueryBuilder('audit_log'), filters);
    query.orderBy('audit_log.timestamp', 'DESC').limit(filters.limit).offset(filters.offset);

    const [items, total] = await Promise.all([
      query.getMany(),
      this.applyFilters(this.auditLogRepository.createQueryBuilder('audit_log'), filters).getCount(),
    ]);

    return { items, total };
  }

  async runRetentionCleanup(): Promise<number> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    try {
      return await this.dataSource.transaction(async (manager: EntityManager) => {
        const rowsToDelete = await manager
          .createQueryBuilder(AuditLog, 'audit_log')
          .where('audit_log.timestamp < :cutoff', { cutoff: cutoff.toISOString() })
          .getCount();
        await manager.query(
          `
            INSERT INTO audit_logs_archive (id, user_id, event_type, timestamp, ip_address, user_agent, details, is_suspicious)
            SELECT id, user_id, event_type, timestamp, ip_address, user_agent, details, is_suspicious
            FROM audit_logs
            WHERE timestamp < $1
            ON CONFLICT (id) DO NOTHING
          `,
          [cutoff.toISOString()],
        );
        await manager.query(`DELETE FROM audit_logs WHERE timestamp < $1`, [cutoff.toISOString()]);
        return rowsToDelete;
      });
    } catch (error) {
      this.logger.error('Failed audit log retention cleanup', error);
      return 0;
    }
  }

  private async countRapidFailures(input: {
    attemptedWalletAddress: string;
    audit: RequestAudit;
  }): Promise<number> {
    const windowStart = new Date(Date.now() - this.suspiciousFailureWindowSeconds * 1000);
    const query = this.auditLogRepository
      .createQueryBuilder('audit_log')
      .where('audit_log.eventType = :eventType', { eventType: AuditEventType.LOGIN_FAILURE })
      .andWhere('audit_log.timestamp >= :windowStart', { windowStart: windowStart.toISOString() });

    if (input.audit.ipAddress) {
      query.andWhere('audit_log.ipAddress = :ipAddress', { ipAddress: input.audit.ipAddress });
    } else {
      query.andWhere(`audit_log.details->>'attemptedWalletAddress' = :attemptedWalletAddress`, {
        attemptedWalletAddress: input.attemptedWalletAddress,
      });
    }

    return query.getCount();
  }

  private applyFilters(
    query: SelectQueryBuilder<AuditLog>,
    filters: ListAuditLogsFilters,
  ): SelectQueryBuilder<AuditLog> {
    if (filters.userId) {
      query.andWhere('audit_log.userId = :userId', { userId: filters.userId });
    }
    if (filters.eventType) {
      query.andWhere('audit_log.eventType = :eventType', { eventType: filters.eventType });
    }
    if (typeof filters.isSuspicious === 'boolean') {
      query.andWhere('audit_log.isSuspicious = :isSuspicious', {
        isSuspicious: filters.isSuspicious,
      });
    }
    if (filters.start) {
      query.andWhere('audit_log.timestamp >= :start', { start: filters.start.toISOString() });
    }
    if (filters.end) {
      query.andWhere('audit_log.timestamp <= :end', { end: filters.end.toISOString() });
    }

    return query;
  }

  private normalizeHeader(value: string | string[] | null): string | null {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return value;
  }

  private get retentionDays(): number {
    return this.getInt('AUDIT_LOG_RETENTION_DAYS', 90);
  }

  private get cleanupIntervalMs(): number {
    return this.getInt('AUDIT_LOG_CLEANUP_INTERVAL_MS', 60 * 60 * 1000);
  }

  private get suspiciousFailureThreshold(): number {
    return this.getInt('AUDIT_SUSPICIOUS_FAILURE_THRESHOLD', 5);
  }

  private get suspiciousFailureWindowSeconds(): number {
    return this.getInt('AUDIT_SUSPICIOUS_FAILURE_WINDOW_SECONDS', 300);
  }

  private getInt(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    if (!value) {
      return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
