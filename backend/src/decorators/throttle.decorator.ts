import { SetMetadata } from '@nestjs/common';

export const THROTTLE_KEY = 'THROTTLE_LIMIT_TTL';

export interface ThrottleOptions {
  limit: number;
  ttl: number; // in seconds
}

/**
 * Configure rate limit for a route or controller
 * @param limit Maximum number of requests allowed within ttl
 * @param ttl Time window in seconds
 * @example @Throttle(10, 60) // 10 requests per 60 seconds
 */
export const Throttle = (limit: number, ttl: number) =>
  SetMetadata(THROTTLE_KEY, { limit, ttl } as ThrottleOptions);
