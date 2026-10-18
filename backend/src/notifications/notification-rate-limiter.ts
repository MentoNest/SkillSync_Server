/**
 * Sliding-window limiter per user and channel (issue #1477), so a bug or a
 * noisy event source cannot flood one person. In-memory: per process.
 */
export class NotificationRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number = 30,
    private readonly windowMs: number = 60_000,
  ) {}

  /** Records a delivery attempt; false means the limit was reached. */
  tryAcquire(userId: string, channel: string, now: number = Date.now()): boolean {
    const key = `${userId}:${channel}`;
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
