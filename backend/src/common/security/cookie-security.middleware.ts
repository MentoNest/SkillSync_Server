import type { CookieOptions, NextFunction, Request, Response } from 'express';
import type { CookieSecurityConfig } from '../../config/app.config';

/**
 * Applies secure defaults to every cookie written through Express, including
 * cookies set by third-party middleware. Callers may still tighten (but not
 * loosen) the flags for a specific cookie.
 */
export function createCookieSecurityMiddleware(config: CookieSecurityConfig) {
  return function cookieSecurity(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const original = res.cookie.bind(res);
    // Applied last so individual cookies cannot weaken the hardened defaults.
    const mandatory: Pick<CookieOptions, 'httpOnly' | 'secure' | 'sameSite'> = {
      httpOnly: config.httpOnly,
      secure: config.secure,
      sameSite: config.sameSite,
    };
    res.cookie = (name: string, value: string, options: CookieOptions = {}) =>
      original(name, value, { ...options, ...mandatory });
    next();
  };
}
