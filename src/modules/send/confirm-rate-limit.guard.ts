import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/auth.interface';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

@Injectable()
export class ConfirmRateLimitGuard implements CanActivate {
  private readonly store = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const userId = req.user?.sub;
    if (!userId) return true; // JWT guard handles auth

    const now = Date.now();
    const entry = this.store.get(userId);

    if (!entry || now > entry.resetAt) {
      this.store.set(userId, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    if (entry.count >= MAX_REQUESTS) {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    entry.count += 1;
    return true;
  }
}
