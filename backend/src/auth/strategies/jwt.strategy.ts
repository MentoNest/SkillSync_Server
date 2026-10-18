import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../guards/jwt-auth.guard';
import { recordJwtFailure } from '../../metrics/metrics.registry';

@Injectable()
export class JwtStrategy {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validate(token: string): Promise<JwtPayload> {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        issuer: this.config.get<string>('JWT_ISSUER') ?? 'skillsync',
        audience: this.config.get<string>('JWT_AUDIENCE') ?? 'skillsync-api',
        algorithms: ['HS256'],
      });
    } catch (err) {
      const reason =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: string }).name ?? 'verify_failed')
          : 'verify_failed';
      recordJwtFailure(reason);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
