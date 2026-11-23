import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InvalidCredentialsException } from '../../common/errors/app-exceptions';
import { AuthService } from '../auth.service';
import { AUTH_CONFIG } from '../auth.types';
import type { AuthConfig, AuthUser, JwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(AUTH_CONFIG) config: AuthConfig,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwtSecret,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.type !== 'access') throw new InvalidCredentialsException('Access token required');
    if (await this.auth.isRevoked(payload.jti)) throw new InvalidCredentialsException('Token has been revoked');
    if (!(await this.auth.isTokenVersionCurrent(payload.sub, payload.ver))) {
      throw new InvalidCredentialsException('Token has been revoked');
    }
    return { address: payload.sub, roles: payload.roles ?? [], jti: payload.jti };
  }
}
