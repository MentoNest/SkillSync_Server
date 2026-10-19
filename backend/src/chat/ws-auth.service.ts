import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { UserStatus } from '../users/user-status/user-status.enum';

/** The parts of a socket.io handshake a token can arrive in. */
export interface HandshakeLike {
  auth?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}

/** Token from `auth.token` (preferred), an `Authorization: Bearer` header, or `?token=`. */
export function extractToken(handshake: HandshakeLike): string | null {
  const fromAuth = handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth.replace(/^Bearer\s+/i, '');

  const header = handshake.headers?.authorization;
  const [scheme, token] = (typeof header === 'string' ? header : '').split(' ');
  if (scheme === 'Bearer' && token) return token;

  const fromQuery = handshake.query?.token;
  return typeof fromQuery === 'string' && fromQuery ? fromQuery : null;
}

/** Verifies WebSocket handshakes with the same rules as the HTTP `JwtAuthGuard`. */
@Injectable()
export class WsAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async authenticate(handshake: HandshakeLike): Promise<JwtPayload> {
    const token = extractToken(handshake);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let user: JwtPayload;
    try {
      user = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        issuer: this.config.get<string>('JWT_ISSUER') ?? 'skillsync',
        audience: this.config.get<string>('JWT_AUDIENCE') ?? 'skillsync-api',
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (user.status && user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }
    return user;
  }
}
