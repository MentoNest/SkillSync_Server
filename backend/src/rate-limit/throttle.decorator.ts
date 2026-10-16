import { SetMetadata } from '@nestjs/common';

export const THROTTLE_KEY = 'rate-limit';

export interface ThrottleOptions {
  /** Max requests per window. */
  limit: number;
  /** Window length in seconds. */
  ttl: number;
}

/** Per-route override of the default limit, e.g. @Throttle(5, 60). */
export const Throttle = (limit: number, ttl: number) => SetMetadata(THROTTLE_KEY, { limit, ttl } as ThrottleOptions);
/** Opt a route out of rate limiting. */
export const SkipThrottle = () => SetMetadata(THROTTLE_KEY, { limit: 0, ttl: 0 } as ThrottleOptions);
