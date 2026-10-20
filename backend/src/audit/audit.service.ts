import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Scheduler decorator and preset cron expressions
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AuditEvent, AuditLog } from './entities/audit-log.entity';

// Shape of the data callers pass in when recording an audit event.
// Only `event` is required; everything else is optional context.
export interface AuditEntry {
  event: AuditEvent;
  userId?: string | null;
  walletAddress?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  // Free-form extra details (e.g. { from: 'mentee', to: 'mentor' } for a role change)
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  // How many days audit rows are kept before the nightly purge removes them
  private readonly retentionDays: number;

  constructor(
    // TypeORM repository for the audit_logs table
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
    config: ConfigService,
  ) {
    // Read AUDIT_RETENTION_DAYS from the environment, defaulting to 90 days.
    // NOTE: a non-numeric value would parse to NaN and make the cutoff date invalid.
    this.retentionDays = parseInt(config.get<string>('AUDIT_RETENTION_DAYS') ?? '90', 10);
  }

  /** Fire-and-forget safe: audit failures must never break an auth request. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.logs.save(
        this.logs.create({
          event: entry.event,
          // `?? null` turns undefined into an explicit null for the DB columns
          userId: entry.userId ?? null,
          walletAddress: entry.walletAddress ?? null,
          ipAddress: entry.ipAddress ?? null,
          // Truncate to 255 chars so an oversized header can't violate the varchar(255) column
          userAgent: entry.userAgent?.slice(0, 255) ?? null,
          metadata: entry.metadata ?? {},
        }),
      );
    } catch (err) {
      // Swallow the error (log only) so a failed audit write never fails the user's request
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }

  // Runs every day at 03:00 (server time) to enforce the retention policy
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<number> {
    // Anything created before this moment is considered expired (86_400_000 ms = 1 day)
    const cutoff = new Date(Date.now() - this.retentionDays * 86_400_000);
    // Single bulk DELETE ... WHERE createdAt < cutoff
    const res = await this.logs.delete({ createdAt: LessThan(cutoff) });
    // `affected` can be undefined on some drivers, so default to 0
    this.logger.log(`Purged ${res.affected ?? 0} audit logs older than ${this.retentionDays} days`);
    return res.affected ?? 0;
  }
}