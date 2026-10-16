import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import { LoginAttempt, SuspicionSignal, SuspiciousLoginDetector } from './suspicious-login';

const MAX_REMEMBERED = 20;

/** Flags the first login from an IP or user agent not seen before for this user. */
@Injectable()
export class KnownDeviceDetector implements SuspiciousLoginDetector {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async detect(a: LoginAttempt): Promise<SuspicionSignal[]> {
    const signals: SuspicionSignal[] = [];
    const checks: Array<[string | null, string, SuspicionSignal['type']]> = [
      [a.ipAddress, 'ips', 'new_ip'],
      [a.userAgent, 'agents', 'new_device'],
    ];
    for (const [value, kind, type] of checks) {
      if (!value) continue;
      const key = `auth:known:${kind}:${a.userId}`;
      const seenBefore = (await this.redis.scard(key)) > 0;
      const added = await this.redis.sadd(key, value);
      if (added === 1) {
        // Cap the set size by dropping a random member when over the limit.
        if ((await this.redis.scard(key)) > MAX_REMEMBERED) await this.redis.spop(key);
        // First-ever value is the baseline, not suspicious.
        if (seenBefore) signals.push({ type, severity: 'low', reason: `First login from this ${kind === 'ips' ? 'IP' : 'device'}` });
      }
    }
    return signals;
  }
}
