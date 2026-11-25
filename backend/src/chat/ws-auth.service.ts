import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthService } from '../auth/auth.service';
import { AUTH_CONFIG } from '../auth/auth.types';
import type { AuthConfig, AuthUser, JwtPayload } from '../auth/auth.types';
import { InvalidCredentialsException } from '../common/errors/app-exceptions';
import { UserStatus } from '../user/user-status.enum';

export interface HandshakeLike {
  auth?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}

const stripBearer = (value: string): string =>
  value.replace(/^Bearer\s+/i, '').trim();

function headerToken(headers: HandshakeLike['headers']): string | null {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() !== 'authorization') continue;
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw === 'string' && raw.trim()) return stripBearer(raw);
  }
  return null;
}

export function extractToken(handshake: HandshakeLike): string | null {
  const fromAuth = handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim())
    return stripBearer(fromAuth);

  const fromHeader = headerToken(handshake.headers);
  if (fromHeader) return fromHeader;

  const fromQuery = handshake.query?.token;
  if (typeof fromQuery === 'string' && fromQuery.trim())
    return stripBearer(fromQuery);
  return null;
}

@Injectable()
export class WsAuthService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly auth: AuthService,
  ) {}

  async authenticate(handshake: HandshakeLike): Promise<AuthUser> {
    const token = extractToken(handshake);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!payload.sub || !payload.jti)
      throw new UnauthorizedException('Invalid token payload');
    if (payload.type !== 'access')
      throw new InvalidCredentialsException('Access token required');
    if (await this.auth.isRevoked(payload.jti))
      throw new InvalidCredentialsException('Token has been revoked');
    if (payload.status && payload.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }

    return {
      address: payload.sub,
      roles: payload.roles ?? [],
      status: payload.status ?? UserStatus.ACTIVE,
      jti: payload.jti,
    };
  }
}
