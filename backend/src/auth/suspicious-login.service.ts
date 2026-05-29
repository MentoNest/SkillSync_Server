import { Injectable, Logger } from '@nestjs/common';

export interface LoginAttempt {
  walletAddress: string;
  ipAddress: string;
  success: boolean;
  timestamp: number;
}

interface WalletStats {
  consecutiveFailures: number;
  knownIps: Set<string>;
  lastSeen: number;
}

const MAX_CONSECUTIVE_FAILURES = 5;
const NEW_IP_ALERT_THRESHOLD = 3; // alert after this many distinct IPs

/**
 * In-memory suspicious login detector.
 * For production, replace the Map with a Redis-backed store.
 */
@Injectable()
export class SuspiciousLoginService {
  private readonly logger = new Logger(SuspiciousLoginService.name);
  private readonly stats = new Map<string, WalletStats>();

  /**
   * Record a login attempt and emit warnings for suspicious patterns.
   */
  record(attempt: LoginAttempt): void {
    const { walletAddress, ipAddress, success } = attempt;
    const existing = this.stats.get(walletAddress) ?? {
      consecutiveFailures: 0,
      knownIps: new Set<string>(),
      lastSeen: 0,
    };

    existing.knownIps.add(ipAddress);
    existing.lastSeen = attempt.timestamp;

    if (success) {
      existing.consecutiveFailures = 0;
    } else {
      existing.consecutiveFailures += 1;
    }

    this.stats.set(walletAddress, existing);
    this.evaluate(walletAddress, existing, ipAddress);
  }

  private evaluate(wallet: string, stats: WalletStats, ip: string): void {
    if (stats.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      this.logger.warn(
        `Suspicious: ${stats.consecutiveFailures} consecutive failures for ${wallet}`,
      );
    }
    if (stats.knownIps.size >= NEW_IP_ALERT_THRESHOLD) {
      this.logger.warn(
        `Suspicious: login from new IP ${ip} for ${wallet} (${stats.knownIps.size} distinct IPs)`,
      );
    }
  }
}