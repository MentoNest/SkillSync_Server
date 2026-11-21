import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { ChangeReason } from './profile-history.entity';
import { profileHistoryStorage } from './profile-history-context';

/**
 * Runs on every request before controllers.
 *
 * Extracts the caller's wallet address from the Bearer JWT (without full
 * passport validation — that happens in guards later).  If the token is
 * absent or invalid, the context defaults to 'system', which is harmless
 * because write endpoints require a valid guard anyway.
 *
 * The context is active for the entire async subtree of the request via
 * `AsyncLocalStorage.run()`, so the TypeORM subscriber can read it without
 * any extra plumbing.
 */
@Injectable()
export class ProfileHistoryContextMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    let changedBy = 'system';
    let reason = ChangeReason.SYSTEM;

    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        // Decode only — the guard verifies the signature; here we just need the sub.
        const payload = this.jwt.decode(token) as { sub?: unknown; roles?: string[] } | null;
        if (typeof payload?.sub === 'string') {
          changedBy = payload.sub;
          reason = payload.roles?.includes('admin')
            ? ChangeReason.ADMIN_EDIT
            : ChangeReason.USER_EDIT;
        }
      } catch {
        // Keep system defaults.
      }
    }

    profileHistoryStorage.run({ changedBy, reason }, next);
  }
}
