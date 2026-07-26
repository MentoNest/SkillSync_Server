import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../config/redis.module';

/**
 * #983: Suspicious login detection service.
 *
 * Tracks failed login attempts, new IP addresses, and rapid patterns.
 * Triggers alerts when thresholds are exceeded.
 */

export interface SuspiciousActivityResult {
  isSuspicious: boolean;
  reason?: string;
  failedAttempts: number;
  isNewIp: boolean;
  shouldLock: boolean;
}

const DEFAULT_CONFIG = {
  maxFailedAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS || '5', 10),
  timeWindowMinutes: parseInt(process.env.TIME_WINDOW_MINUTES || '15', 10),
  lockdownMinutes: parseInt(process.env.LOCKDOWN_MINUTES || '30', 10),
  newIpLookbackDays: parseInt(process.env.NEW_IP_LOOKBACK_DAYS || '30', 10),
};

@Injectable()
export class SuspiciousLoginService {
  private readonly logger = new Logger(SuspiciousLoginService.name);
  private lockdowns = new Map<string, number>(); // wallet -> lockdown expiry

  constructor(private readonly redisService: RedisService) {}

  /**
   * Record a failed login attempt and check for suspicious patterns.
   */
  async recordFailedAttempt(walletAddress: string, ipAddress: string): Promise<SuspiciousActivityResult> {
    const config = DEFAULT_CONFIG;

    // Check if account is currently locked
    const lockExpiry = this.lockdowns.get(walletAddress);
    if (lockExpiry && Date.now() < lockExpiry) {
      return {
        isSuspicious: true,
        reason: 'Account temporarily locked due to suspicious activity',
        failedAttempts: 0,
        isNewIp: false,
        shouldLock: false,
      };
    }
    if (lockExpiry && Date.now() >= lockExpiry) {
      this.lockdowns.delete(walletAddress);
    }

    // Increment failed attempt counter in Redis
    const counterKey = `failed_login:${walletAddress}`;
    const count = await this.redisService.incr(counterKey);
    await this.redisService.expire(counterKey, config.timeWindowMinutes * 60);

    // Check IP history
    const ipKey = `login_ips:${walletAddress}`;
    const knownIps = await this.redisService.get(ipKey);
    const ipList: string[] = knownIps ? JSON.parse(knownIps) : [];
    const isNewIp = !ipList.includes(ipAddress);

    // Record this IP
    if (isNewIp) {
      ipList.push(ipAddress);
      await this.redisService.set(ipKey, JSON.stringify(ipList), config.newIpLookbackDays * 86400);
    }

    const isSuspicious = count >= config.maxFailedAttempts;

    if (isSuspicious) {
      this.logger.warn(
        `Suspicious login detected for ${walletAddress.slice(0, 8)}...: ${count} failed attempts in ${config.timeWindowMinutes}min`,
      );

      // Trigger lockdown
      const lockdownExpiry = Date.now() + config.lockdownMinutes * 60 * 1000;
      this.lockdowns.set(walletAddress, lockdownExpiry);
    }

    return {
      isSuspicious,
      reason: isSuspicious
        ? `${count} failed login attempts in ${config.timeWindowMinutes} minutes`
        : undefined,
      failedAttempts: count,
      isNewIp,
      shouldLock: isSuspicious,
    };
  }

  /**
   * Record a successful login — clear failed attempts.
   */
  async recordSuccessfulLogin(walletAddress: string, ipAddress: string): Promise<void> {
    const counterKey = `failed_login:${walletAddress}`;
    await this.redisService.del(counterKey);

    // Add IP to known list
    const ipKey = `login_ips:${walletAddress}`;
    const knownIps = await this.redisService.get(ipKey);
    const ipList: string[] = knownIps ? JSON.parse(knownIps) : [];
    if (!ipList.includes(ipAddress)) {
      ipList.push(ipAddress);
      await this.redisService.set(ipKey, JSON.stringify(ipList), DEFAULT_CONFIG.newIpLookbackDays * 86400);
    }
  }

  /**
   * Admin endpoint: get suspicious activity summary for a wallet.
   */
  async getSuspiciousActivitySummary(walletAddress: string): Promise<{
    failedAttempts: number;
    knownIps: string[];
    isLocked: boolean;
    lockExpiry: number | null;
  }> {
    const counterKey = `failed_login:${walletAddress}`;
    const countStr = await this.redisService.get(counterKey);
    const count = countStr ? parseInt(countStr, 10) : 0;

    const ipKey = `login_ips:${walletAddress}`;
    const knownIpsStr = await this.redisService.get(ipKey);
    const knownIps: string[] = knownIpsStr ? JSON.parse(knownIpsStr) : [];

    const lockExpiry = this.lockdowns.get(walletAddress) || null;
    const isLocked = lockExpiry !== null && Date.now() < lockExpiry;

    return { failedAttempts: count, knownIps, isLocked, lockExpiry };
  }
}
