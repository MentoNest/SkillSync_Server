import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent, AuditLog } from './entities/audit-log.entity';

export interface AuditEntry {
  event: AuditEvent;
  walletAddress?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly logs: Repository<AuditLog>,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.logs.save(
        this.logs.create({
          event: entry.event,
          walletAddress: entry.walletAddress?.slice(0, 56) ?? null,
          targetId: entry.targetId?.slice(0, 100) ?? null,
          ipAddress: entry.ipAddress?.slice(0, 64) ?? null,
          userAgent: entry.userAgent?.slice(0, 255) ?? null,
          metadata: entry.metadata ?? {},
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to write audit log: ${(error as Error).message}`,
      );
    }
  }
}
