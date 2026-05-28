import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

type JwtClaims = Record<string, unknown> & {
  sub?: string;
  typ?: 'access' | 'refresh';
  role?: string;
  roles?: unknown;
  exp?: number;
};

@Injectable()
export class AdminAccessGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Admin access requires a bearer token');
    }
    const token = authorization.slice('Bearer '.length).trim();
    const claims = this.verifyJwt(token);
    const isAdmin =
      claims.role === 'admin' ||
      (Array.isArray(claims.roles) && claims.roles.some((role) => role === 'admin'));

    if (!isAdmin) {
      throw new UnauthorizedException('Admin role required');
    }
    return true;
  }

  private verifyJwt(token: string): JwtClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid access token');
    }
    const [encodedHeader, encodedPayload, signature] = parts;
    let header: { alg?: string; typ?: string };
    try {
      header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as {
        alg?: string;
        typ?: string;
      };
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      throw new UnauthorizedException('Invalid access token');
    }
    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`, this.accessSecret);
    if (!this.safeEquals(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid access token');
    }

    let payload: JwtClaims;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as JwtClaims;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid access token type');
    }
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Access token has expired');
    }
    return payload;
  }

  private sign(value: string, secret: string): string {
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private safeEquals(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
  }

  private get accessSecret(): string {
    return this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET') ?? this.jwtSecret;
  }

  private get jwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (secret) {
      return secret;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be configured in production');
    }
    return 'development-only-change-me';
  }
}
