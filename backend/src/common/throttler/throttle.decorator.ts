import { SetMetadata } from '@nestjs/common';

export const THROTTLE_KEY = 'throttle';

export interface ThrottleOptions {
  limit: number;
  ttl: number; // seconds
}

/** @Throttle(limit, ttl) — e.g. @Throttle(5, 60) = 5 req/60s */
export const Throttle = (limit: number, ttl: number): MethodDecorator & ClassDecorator =>
  SetMetadata(THROTTLE_KEY, { limit, ttl });

/** Skip throttling for a route */
export const SkipThrottle = (): MethodDecorator & ClassDecorator =>
  SetMetadata(THROTTLE_KEY, null);
