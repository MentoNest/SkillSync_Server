import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { AuditLogService } from './audit-log.service';

export interface SuspiciousEvent {
  wallet: string;
  ip: string;
  reason: string;
  timestamp: string;
  failedAttempts?: number;
  isNewIp?: boolean;
  lockdownApplied?: boolean;
}

const MAX_FAILED = () => parseInt(process.env.MAX_FAILED_ATTEMPTS ?? '5', 10);
const TIME_WINDOW = () => parseInt(process.env.TIME_WINDOW_MINUTES ?? '15', 10) * 60;
const LOCKDOWN_TTL = 30 * 60; // 30 minutes
const KNOWN_IP_TTL = 30 * 24 * 60 * 60; // 30 days
const EVENTS_TTL = 7 * 24 * 60 * 60; // 7 days retention

@Injectable()
export class SuspiciousActivityService {
  private readonly logger = new Logger(SuspiciousActivityService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Call on every failed login. Returns true if suspicious threshold crossed. */
  async trackFailedAttempt(wallet: string, ip: string): Promise<boolean> {
    const client = this.redisService.getClient();
    const key = `suspiciousFails:${wallet}`;
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, TIME_WINDOW());

    const isNewIp = await this.checkNewIp(wallet, ip);
    const threshold = MAX_FAILED();

    if (count >= threshold || isNewIp) {
      await this.flagSuspicious(wallet, ip, {
        reason: isNewIp ? 'new_ip_login_failure' : 'consecutive_failures',
        failedAttempts: count,
        isNewIp,
      });
      return true;
    }
    return false;
  }

  /** Call on successful login to register IP as known. */
  async registerKnownIp(wallet: string, ip: string): Promise<void> {
    const client = this.redisService.getClient();
    await client.set(`knownIp:${wallet}:${ip}`, '1', 'EX', KNOWN_IP_TTL);
    await client.del(`suspiciousFails:${wallet}`);
  }

  /** Returns true if ip has NOT been seen for this wallet in the last 30 days. */
  async checkNewIp(wallet: string, ip: string): Promise<boolean> {
    const val = await this.redisService.getClient().get(`knownIp:${wallet}:${ip}`);
    return val === null;
  }

  /** Apply a 30-minute lockdown on a wallet. */
  async applyLockdown(wallet: string): Promise<void> {
    await this.redisService.getClient().set(`lockdown:${wallet}`, '1', 'EX', LOCKDOWN_TTL);
  }

  /** Returns true if wallet is currently locked down. */
  async isLockedDown(wallet: string): Promise<boolean> {
    const val = await this.redisService.getClient().get(`lockdown:${wallet}`);
    return val !== null;
  }

  /** Returns seconds until lockdown expires, or 0. */
  async lockdownTtl(wallet: string): Promise<number> {
    const ttl = await this.redisService.getClient().ttl(`lockdown:${wallet}`);
    return Math.max(0, ttl);
  }

  /** Retrieve recent suspicious events for admin dashboard (last 100). */
  async getRecentEvents(): Promise<SuspiciousEvent[]> {
    const client = this.redisService.getClient();
    const raw = await client.lrange('suspiciousEvents', 0, 99);
    return raw.map((r) => {
      try { return JSON.parse(r) as SuspiciousEvent; } catch { return null; }
    }).filter(Boolean) as SuspiciousEvent[];
  }

  private async flagSuspicious(
    wallet: string,
    ip: string,
    details: Omit<SuspiciousEvent, 'wallet' | 'ip' | 'timestamp'>,
  ): Promise<void> {
    const event: SuspiciousEvent = {
      wallet,
      ip,
      timestamp: new Date().toISOString(),
      ...details,
    };

    this.logger.warn(JSON.stringify({ isSuspicious: true, ...event }));

    // Persist to Redis list for dashboard
    const client = this.redisService.getClient();
    await client.lpush('suspiciousEvents', JSON.stringify(event));
    await client.expire('suspiciousEvents', EVENTS_TTL);

    // Audit log
    await this.auditLogService.logAttempt(wallet, 'failure', 'suspicious_activity');

    // Webhook/email alert (fire-and-forget)
    this.sendAlert(event).catch(() => {});
  }

  private async sendAlert(event: SuspiciousEvent): Promise<void> {
    const webhookUrl = process.env.SUSPICIOUS_ACTIVITY_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSuspicious: true, ...event }),
      });
    } catch (err) {
      this.logger.error('Failed to send suspicious activity alert', err);
    }
  }
}
