import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../redis/redis.service';
import { AuditLogService } from './audit-log.service';
import { AuditEventType } from './entities/audit-log.entity';

const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_TIME_WINDOW_MINUTES = 15;

/** Multiplier applied to the failed-attempt TTL when evicting the known-IP set,
 *  so a wallet's known IP list survives across several rolling windows. */
const KNOWN_IPS_RETENTION_MULTIPLIER = 4;

@Injectable()
export class SuspiciousLoginService {
  private readonly maxFailedAttempts: number;
  private readonly timeWindowSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {
    this.maxFailedAttempts =
      this.configService.get<number>(
        'MAX_FAILED_ATTEMPTS',
        DEFAULT_MAX_FAILED_ATTEMPTS,
      );
    this.timeWindowSeconds =
      this.configService.get<number>(
        'TIME_WINDOW_MINUTES',
        DEFAULT_TIME_WINDOW_MINUTES,
      ) * 60;
  }

  /**
   * Increment the per-(wallet, ip) failure counter and (re-)set its TTL in a
   * single atomic pipeline so a crash between commands cannot orphan a key
   * with no expiry. The TTL is set on every call to give us a sliding window.
   */
  async recordFailedAttempt(wallet: string, ip: string): Promise<void> {
    const key = `suspicious:failed:${wallet}:${ip}`;
    const client = this.redisService.getClient();
    await client
      .multi()
      .incr(key)
      .expire(key, this.timeWindowSeconds)
      .exec();
  }

  /**
   * Returns true when the wallet+ip counter has crossed the configured
   * threshold. Emits a SUSPICIOUS_LOGIN_DETECTED audit event in that case.
   * `userId` is set to the wallet string because the call happens before
   * the user record is resolved by the auth controller; the wallet double-
   * serves as a stable identifier in the audit table.
   */
  async checkSuspicious(wallet: string, ip: string): Promise<boolean> {
    const key = `suspicious:failed:${wallet}:${ip}`;
    const value = await this.redisService.getClient().get(key);
    const count = value ? parseInt(value, 10) : 0;
    if (count >= this.maxFailedAttempts) {
      await this.auditLogService.logEvent({
        userId: wallet,
        eventType: AuditEventType.SUSPICIOUS_LOGIN_DETECTED,
        details: { ip, failedAttempts: count },
      });
      return true;
    }
    return false;
  }

  /**
   * Add an IP to the wallet's "known IPs" set with bounded retention so the
   * set does not grow forever. The retention window is several times longer
   * than the failed-attempt window so a user's good IPs survive across
   * multiple rolling windows.
   */
  async recordSuccessfulLogin(wallet: string, ip: string): Promise<void> {
    const key = `suspicious:known_ips:${wallet}`;
    const retentionSeconds = this.timeWindowSeconds * KNOWN_IPS_RETENTION_MULTIPLIER;
    const client = this.redisService.getClient();
    await client
      .multi()
      .sadd(key, ip)
      .expire(key, retentionSeconds)
      .exec();
  }
}
