import { SetMetadata } from "@nestjs/common";

/**
 * Metadata key under which throttle settings are stored on a route or
 * controller. The rate-limit guard reads the same key through `Reflector`,
 * so the decorators and the guard must always share this constant.
 */
export const THROTTLE_KEY = "rate-limit";

/** Rate-limit settings attached to a route or controller. */
export interface ThrottleOptions {
  /** Max requests per window. */
  limit: number;
  /** Window length in seconds. */
  ttl: number;
}

/**
 * Per-route override of the default limit, e.g. @Throttle(5, 60).
 *
 * Can be placed on a single handler or on a whole controller class. A handler
 * setting takes precedence over a class setting, and either one takes
 * precedence over the guard's environment-based defaults.
 *
 * @param limit Max requests allowed per window.
 * @param ttl Window length in seconds.
 */
export const Throttle = (limit: number, ttl: number) =>
  SetMetadata(THROTTLE_KEY, { limit, ttl } as ThrottleOptions);

/**
 * Opt a route out of rate limiting.
 *
 * Works by storing a limit of 0, which the guard treats as "limiting
 * disabled" and returns early (the ttl of 0 is never used).
 */
export const SkipThrottle = () =>
  SetMetadata(THROTTLE_KEY, { limit: 0, ttl: 0 } as ThrottleOptions);
