import { Injectable, Logger } from '@nestjs/common';
import { AuditEventType } from './entities/audit-log.entity';

export interface RequestAudit {
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string | null;
}

export interface LogEventInput {
  userId: string;
  eventType: AuditEventType;
  audit?: RequestAudit;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  /** Log a login attempt (used by AuthController). */
  async logAttempt(
    wallet: string,
    status: 'success' | 'failure',
    reason: string,
    userId?: string,
  ) {
    this.logger.log(
      JSON.stringify({
        event: 'login_attempt',
        wallet,
        status,
        reason,
        userId: userId ?? null,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  /** Log a structured audit event (used by UsersService and others). */
  async logEvent(input: LogEventInput): Promise<void> {
    this.logger.log(
      JSON.stringify({
        event: input.eventType,
        userId: input.userId,
        details: input.details ?? {},
        ipAddress: input.audit?.ipAddress ?? null,
        userAgent: input.audit?.userAgent ?? null,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
