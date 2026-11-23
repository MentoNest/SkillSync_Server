import { MESSAGE_RATE_LIMIT, MESSAGE_RATE_WINDOW_MS } from './chat.types';

export class MessageRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number = MESSAGE_RATE_LIMIT,
    private readonly windowMs: number = MESSAGE_RATE_WINDOW_MS,
  ) {}

  tryAcquire(userId: string, now: number = Date.now()): boolean {
    const recent = (this.hits.get(userId) ?? []).filter(
      (time) => now - time < this.windowMs,
    );
    if (recent.length >= this.limit) {
      this.hits.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(userId, recent);
    return true;
  }
}
