import { Injectable, Logger } from '@nestjs/common';

export interface RateLimitEntry {
  address: string;
  count: number;
  windowStart: number;
}

@Injectable()
export class RateLimitAnalyticsService {
  private readonly logger = new Logger(RateLimitAnalyticsService.name);
  private readonly rateLimits = new Map<string, RateLimitEntry>();
  private readonly metricCounts = new Map<string, number>();

  /**
   * Enforces rate limiting per Stellar address over a specified time window.
   */
  public checkAddressRateLimit(address: string, maxRequests: number = 100, windowMs: number = 60000): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(address);

    if (!entry || now - entry.windowStart > windowMs) {
      this.rateLimits.set(address, { address, count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= maxRequests) {
      this.logger.warn(`Rate limit exceeded for address ${address}`);
      return false;
    }

    entry.count += 1;
    return true;
  }

  /**
   * Tracks and aggregates operational metrics for analytics reporting.
   */
  public trackMetric(metricName: string, value: number = 1): void {
    const current = this.metricCounts.get(metricName) || 0;
    this.metricCounts.set(metricName, current + value);
    this.logger.log(`Metric ${metricName} updated to ${current + value}`);
  }
}
