import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  async logAttempt(wallet: string, status: 'success' | 'failure', reason: string, userId?: string) {
    this.logger.log(JSON.stringify({
      event: 'login_attempt',
      wallet,
      status,
      reason,
      userId: userId ?? null,
      timestamp: new Date().toISOString(),
    }));
  }
}
