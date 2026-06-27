import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { RedisService } from './redis/redis.service';
import { JwtAccessTokenPayload } from './jwt-payload.interface';

export const OPTIONAL_AUTH_KEY = 'optionalAuth';
/** Mark a route as accepting requests with or without a valid token. */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Request & { user?: JwtAccessTokenPayload }>();
    const token = this.extractToken(req);

    if (!token) {
      if (optional) return true;
      throw new UnauthorizedException({ message: 'No token provided', code: 'missing_token' });
    }

    let payload: JwtAccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtAccessTokenPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch (err: any) {
      if (optional) return true;
      if (err?.name === 'TokenExpiredError') {
        throw new UnauthorizedException({ message: 'Token has expired', code: 'token_expired' });
      }
      throw new UnauthorizedException({ message: 'Invalid token', code: 'invalid_token' });
    }

    if (!payload?.jti) {
      if (optional) return true;
      throw new UnauthorizedException({ message: 'Invalid token payload', code: 'invalid_token' });
    }

    // Redis blacklist check
    const blacklisted = await this.redisService.getClient().get(`blacklist:jti:${payload.jti}`);
    if (blacklisted) {
      if (optional) return true;
      throw new UnauthorizedException({ message: 'Token has been revoked', code: 'token_revoked' });
    }

    req.user = payload;
    return true;
  }

  private extractToken(req: Request): string | null {
    const auth = req.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7).trim() || null;
  }
}
