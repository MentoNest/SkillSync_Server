import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, LessThan, Repository } from 'typeorm';
import { AuditEventType, AuditLog } from './entities/audit-log.entity';

export interface AuditEventInput {
  eventType: AuditEventType | string;
  userId?: string | null;
  /** Wallet the event relates to. Recorded for failed logins too. */
  walletAddress?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Event specific context, persisted as JSONB. */
  details?: Record<string, any> | null;
  isSuspicious?: boolean;
  suspiciousReason?: string | null;
  geoCountry?: string | null;
  geoCity?: string | null;
  geoLat?: number | null;
  geoLon?: number | null;
}

export interface AuditLogQuery {
  userId?: string;
  walletAddress?: string;
  eventType?: string;
  /** Accepts a single event type or a list of them. */
  eventTypes?: string[];
  isSuspicious?: boolean;
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
  offset?: number;
}

export interface AuditLogPage {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditCleanupResult {
  archivedCount: number;
  deletedCount: number;
  retentionDays: number;
  cutoff: Date;
  archivedLogs: AuditLog[];
}

/**
 * #1320: audit logging for all authentication related events.
 *
 * Design notes:
 *  - Every write is best effort. A failing audit insert must never turn a
 *    successful login into a 500, so errors are logged and swallowed.
 *  - Rapid repeated failures (brute force probing) are automatically flagged
 *    with `isSuspicious: true` so they surface on the admin dashboard.
 *  - Retention defaults to 90 days and is configurable via
 *    `AUDIT_LOG_RETENTION_DAYS`. Cleanup runs on boot and then daily.
 */
@Injectable()
export class AuditService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);

  /** Fallback retention when `AUDIT_LOG_RETENTION_DAYS` is not set. */
  static readonly DEFAULT_RETENTION_DAYS = 90;

  /** Failures within this window are considered part of the same attack. */
  static readonly SUSPICIOUS_WINDOW_MINUTES = 15;

  /** Number of failures in the window that trips the suspicious flag. */
  static readonly SUSPICIOUS_FAILURE_THRESHOLD = 3;

  /** How often expired rows are swept, in milliseconds (24h). */
  static readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /** Retention window in days, configurable through the environment. */
  get retentionDays(): number {
    const configured = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS ?? '', 10);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : AuditService.DEFAULT_RETENTION_DAYS;
  }

  // ─── Bootstrapping / retention scheduling ────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    await this.runScheduledCleanup();
    this.cleanupTimer = setInterval(
      () => void this.runScheduledCleanup(),
      AuditService.CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * #1320: automatic cleanup of logs older than the configured retention
   * period. Failures are swallowed — a retention sweep must not prevent the
   * application from serving traffic.
   */
  async runScheduledCleanup(): Promise<{
    deletedCount: number;
    retentionDays: number;
    cutoff: Date;
  } | null> {
    try {
      const result = await this.cleanupOldLogs();
      if (result.deletedCount > 0) {
        this.logger.log(
          `Retention sweep removed ${result.deletedCount} audit log(s) older than ${result.retentionDays} days`,
        );
      }
      return result;
    } catch (error) {
      this.logger.error(
        `Audit log retention sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  // ─── Writing events ─────────────────────────────────────────────────────

  /**
   * Persist a single audit event. Returns `null` (instead of throwing) when the
   * insert fails so callers on the authentication hot path stay unaffected.
   */
  async log(event: AuditEventInput): Promise<AuditLog | null> {
    try {
      const details = event.details ?? {};

      // #1320: failed logins must remember the wallet that was attempted so
      // brute force runs against a single account can be detected and grouped.
      const walletAddress =
        event.walletAddress ??
        (typeof details['attemptedWalletAddress'] === 'string'
          ? (details['attemptedWalletAddress'] as string)
          : null);

      let isSuspicious = event.isSuspicious ?? false;
      if (!isSuspicious && event.eventType === AuditEventType.LOGIN_FAILURE) {
        isSuspicious = await this.detectRapidFailures(
          event.ipAddress ?? null,
          walletAddress,
        );
      }

      const auditLog = this.auditLogRepository.create({
        userId: event.userId ?? null,
        eventType: event.eventType,
        walletAddress: walletAddress ?? null,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
        details,
        isSuspicious,
        suspiciousReason: event.suspiciousReason ?? null,
        geoCountry: event.geoCountry ?? null,
        geoCity: event.geoCity ?? null,
        geoLat: event.geoLat ?? null,
        geoLon: event.geoLon ?? null,
      });

      return await this.auditLogRepository.save(auditLog);
    } catch (error) {
      this.logger.error(
        `Failed to persist audit log for ${String(event.eventType)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  async logLoginSuccess(params: {
    userId: string;
    walletAddress?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    method?: string;
    network?: string;
  }): Promise<AuditLog | null> {
    return this.log({
      eventType: AuditEventType.LOGIN_SUCCESS,
      userId: params.userId,
      walletAddress: params.walletAddress ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      details: {
        method: params.method ?? 'wallet_signature',
        network: params.network ?? null,
      },
    });
  }

  /**
   * #1320: failed logins always carry the attempted wallet address so an
   * attacker enumerating accounts is visible in the audit trail.
   */
  async logLoginFailure(params: {
    userId?: string | null;
    attemptedWalletAddress?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    reason: string;
    method?: string;
    network?: string;
  }): Promise<AuditLog | null> {
    return this.log({
      eventType: AuditEventType.LOGIN_FAILURE,
      userId: params.userId ?? null,
      walletAddress: params.attemptedWalletAddress ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      suspiciousReason: params.reason,
      details: {
        attemptedWalletAddress: params.attemptedWalletAddress ?? null,
        reason: params.reason,
        method: params.method ?? 'wallet_signature',
        network: params.network ?? null,
      },
    });
  }

  async logLogout(params: {
    userId: string;
    walletAddress?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    /** 'session' for a single logout, 'all' for logout-everywhere. */
    scope?: 'session' | 'all';
    blacklistedToken?: boolean;
    refreshTokenRevoked?: boolean;
    revokedSessionsCount?: number;
    tokenVersion?: number;
  }): Promise<AuditLog | null> {
    return this.log({
      eventType:
        params.scope === 'all' ? AuditEventType.LOGOUT_ALL : AuditEventType.LOGOUT,
      userId: params.userId,
      walletAddress: params.walletAddress ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      details: {
        scope: params.scope ?? 'session',
        blacklistedToken: params.blacklistedToken ?? false,
        refreshTokenRevoked: params.refreshTokenRevoked ?? false,
        revokedSessionsCount: params.revokedSessionsCount ?? null,
        tokenVersion: params.tokenVersion ?? null,
      },
    });
  }

  async logTokenRefresh(params: {
    userId: string;
    walletAddress?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    rotated?: boolean;
    deviceFingerprint?: string | null;
    reason?: string;
  }): Promise<AuditLog | null> {
    return this.log({
      eventType: AuditEventType.TOKEN_REFRESH,
      userId: params.userId,
      walletAddress: params.walletAddress ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      details: {
        rotated: params.rotated ?? false,
        deviceFingerprint: params.deviceFingerprint ?? null,
        reason: params.reason ?? null,
      },
    });
  }

  async logPasswordChange(params: {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    /** 'change' for a self-service change, 'reset' for an admin driven one. */
    kind?: 'change' | 'reset';
    performedBy?: string | null;
  }): Promise<AuditLog | null> {
    return this.log({
      eventType:
        params.kind === 'reset'
          ? AuditEventType.PASSWORD_RESET
          : AuditEventType.PASSWORD_CHANGE,
      userId: params.userId,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      details: {
        kind: params.kind ?? 'change',
        performedBy: params.performedBy ?? params.userId,
      },
    });
  }

  async logRoleChange(params: {
    /** User whose role set changed. */
    targetUserId: string;
    /** Admin that performed the change. */
    actorId: string;
    roleName: string;
    action: 'assigned' | 'revoked';
    ipAddress?: string | null;
    userAgent?: string | null;
    tokenVersion?: number;
  }): Promise<AuditLog | null> {
    return this.log({
      eventType:
        params.action === 'assigned'
          ? AuditEventType.ROLE_ASSIGNED
          : AuditEventType.ROLE_REVOKED,
      userId: params.targetUserId,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      details: {
        targetUserId: params.targetUserId,
        actorId: params.actorId,
        roleName: params.roleName,
        action: params.action,
        tokenVersion: params.tokenVersion ?? null,
      },
    });
  }

  async logSuspiciousActivity(params: {
    userId?: string | null;
    walletAddress?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    reason: string;
    details?: Record<string, any> | null;
  }): Promise<AuditLog | null> {
    return this.log({
      eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
      userId: params.userId ?? null,
      walletAddress: params.walletAddress ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      isSuspicious: true,
      suspiciousReason: params.reason,
      details: { reason: params.reason, ...(params.details ?? {}) },
    });
  }

  // ─── Reading events (admin only — enforced by AuditController) ───────────

  async getLogs(query: AuditLogQuery = {}): Promise<AuditLogPage> {
    const where: FindOptionsWhere<AuditLog> = {};

    if (query.userId) where.userId = query.userId;
    if (query.walletAddress) where.walletAddress = query.walletAddress;
    if (typeof query.isSuspicious === 'boolean') {
      where.isSuspicious = query.isSuspicious;
    }

    if (query.eventTypes?.length) {
      where.eventType = In(query.eventTypes);
    } else if (query.eventType) {
      where.eventType = query.eventType;
    }

    if (query.startDate || query.endDate) {
      const from = query.startDate ? new Date(query.startDate) : undefined;
      const to = query.endDate ? new Date(query.endDate) : undefined;
      if (from && to) {
        where.timestamp = Between(from, to);
      } else if (from) {
        where.timestamp = Between(from, new Date(8.64e15));
      } else if (to) {
        where.timestamp = Between(new Date(0), to);
      }
    }

    const limit = AuditService.clampPagination(query.limit, 50, 500);
    const offset = AuditService.clampPagination(query.offset, 0, 1_000_000) ?? 0;

    const [logs, total] = await this.auditLogRepository.findAndCount({
      where,
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { logs, total, limit, offset };
  }

  async getLogById(id: string): Promise<AuditLog | null> {
    return this.auditLogRepository.findOne({ where: { id } });
  }

  /** Event type breakdown, used by the admin compliance dashboard. */
  async getEventTypeSummary(query: AuditLogQuery = {}): Promise<
    Array<{ eventType: string; count: number }>
  > {
    const page = await this.getLogs({ ...query, limit: 500, offset: 0 });
    const counts = new Map<string, number>();

    for (const log of page.logs) {
      counts.set(String(log.eventType), (counts.get(String(log.eventType)) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ─── Retention ──────────────────────────────────────────────────────────

  /**
   * #1320: delete rows older than the retention window without keeping a copy.
   */
  async cleanupOldLogs(retentionDays: number = this.retentionDays): Promise<{
    deletedCount: number;
    retentionDays: number;
    cutoff: Date;
  }> {
    const cutoff = AuditService.cutoffFor(retentionDays);
    const result = await this.auditLogRepository.delete({
      timestamp: LessThan(cutoff),
    });

    return {
      deletedCount: result.affected ?? 0,
      retentionDays,
      cutoff,
    };
  }

  /**
   * #1320: archive then purge. The caller receives the expired rows so they can
   * be shipped to cold storage (object storage / SIEM) before deletion.
   */
  async archiveAndCleanup(
    retentionDays: number = this.retentionDays,
  ): Promise<AuditCleanupResult> {
    const cutoff = AuditService.cutoffFor(retentionDays);

    const archivedLogs = await this.auditLogRepository.find({
      where: { timestamp: LessThan(cutoff) },
      order: { timestamp: 'ASC' },
    });

    const archivedCount = archivedLogs.length;
    let deletedCount = 0;

    if (archivedCount > 0) {
      const result = await this.auditLogRepository.delete({
        timestamp: LessThan(cutoff),
      });
      deletedCount = result.affected ?? archivedCount;
      this.logger.log(
        `Archived and removed ${deletedCount} audit log(s) older than ${retentionDays} days (before ${cutoff.toISOString()})`,
      );
    }

    return { archivedCount, deletedCount, retentionDays, cutoff, archivedLogs };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /**
   * Flags a failure as suspicious once the same IP or wallet has produced
   * {@link SUSPICIOUS_FAILURE_THRESHOLD} failures inside the sliding window.
   */
  private async detectRapidFailures(
    ipAddress: string | null,
    walletAddress: string | null,
  ): Promise<boolean> {
    if (!ipAddress && !walletAddress) {
      return false;
    }

    const windowStart = new Date(
      Date.now() - AuditService.SUSPICIOUS_WINDOW_MINUTES * 60 * 1000,
    );

    const query = this.auditLogRepository
      .createQueryBuilder('log')
      .where('log.eventType = :eventType', { eventType: AuditEventType.LOGIN_FAILURE })
      .andWhere('log.timestamp >= :windowStart', { windowStart });

    const orConditions: string[] = [];
    if (ipAddress) {
      orConditions.push('log.ipAddress = :ipAddress');
      query.setParameter('ipAddress', ipAddress);
    }
    if (walletAddress) {
      orConditions.push('log.walletAddress = :walletAddress');
      orConditions.push("log.details ->> 'attemptedWalletAddress' = :walletAddress");
      query.setParameter('walletAddress', walletAddress);
    }
    query.andWhere(`(${orConditions.join(' OR ')})`);

    const recentFailures = await query.getCount();

    // `+ 1` accounts for the failure currently being written.
    return recentFailures + 1 >= AuditService.SUSPICIOUS_FAILURE_THRESHOLD;
  }

  private static cutoffFor(retentionDays: number): Date {
    return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  }

  private static clampPagination(
    value: number | undefined,
    fallback: number,
    max: number,
  ): number {
    if (value === undefined || value === null || !Number.isFinite(value)) {
      return fallback;
    }
    const parsed = Math.trunc(value);
    if (parsed < 0) return fallback;
    return Math.min(parsed, max);
  }
}
