import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtAccessTokenPayload } from '../interfaces/jwt-payload.interface.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtAccessTokenPayload }>();
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException({
        message: 'No token provided',
        code: 'missing_token',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtAccessTokenPayload>(
        token,
        {
          secret: this.configService.get<string>('JWT_SECRET'),
        },
      );
      req.user = payload;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          message: 'Token has expired',
          code: 'token_expired',
        });
      }
      throw new UnauthorizedException({
        message: 'Invalid token',
        code: 'invalid_token',
      });
    }

    return true;
  }

  private extractToken(req: Request): string | null {
    const auth = req.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7).trim() || null;
  }
}
