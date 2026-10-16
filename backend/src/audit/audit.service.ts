import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AuditEvent, AuditLog } from './entities/audit-log.entity';

export interface AuditEntry {
  event: AuditEvent;
  userId?: string | null;
  walletAddress?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly retentionDays: number;

  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
    config: ConfigService,
  ) {
    this.retentionDays = parseInt(config.get<string>('AUDIT_RETENTION_DAYS') ?? '90', 10);
  }

  /** Fire-and-forget safe: audit failures must never break an auth request. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.logs.save(
        this.logs.create({
          event: entry.event,
          userId: entry.userId ?? null,
          walletAddress: entry.walletAddress ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent?.slice(0, 255) ?? null,
          metadata: entry.metadata ?? {},
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - this.retentionDays * 86_400_000);
    const res = await this.logs.delete({ createdAt: LessThan(cutoff) });
    this.logger.log(`Purged ${res.affected ?? 0} audit logs older than ${this.retentionDays} days`);
    return res.affected ?? 0;
  }
}
