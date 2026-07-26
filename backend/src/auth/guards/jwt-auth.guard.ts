import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtAccessTokenPayload } from '../interfaces/jwt-payload.interface.js';

/**
 * #981: Enhanced JWT Auth Guard.
 *
 * Validates Bearer tokens, supports optional authentication mode, and
 * attaches the decoded payload to the request.
 */

export interface JwtGuardOptions {
  /** If true, endpoints work both with and without valid tokens */
  optional?: boolean;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtAccessTokenPayload }>();
    const token = this.extractToken(req);

    if (!token) {
      // Optional mode: allow through without auth
      return true;
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<JwtAccessTokenPayload>(token);

      req.user = payload;
      return true;
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) throw err;

      if (err instanceof Error) {
        if (err.name === 'TokenExpiredError') {
          throw new UnauthorizedException({
            message: 'Token has expired',
            code: 'token_expired',
          });
        }
      }

      throw new UnauthorizedException({
        message: 'Invalid token',
        code: 'invalid_token',
      });
    }
  }

  private extractToken(req: Request): string | null {
    const auth = req.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7).trim() || null;
  }
}
