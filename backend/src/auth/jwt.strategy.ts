import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthService, AccessTokenPayload } from './jwt.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtAuthService: JwtAuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_SIGNING_ALG') === 'RS256'
          ? config.get<string>('JWT_PUBLIC_KEY')
          : config.get<string>('JWT_ACCESS_SECRET'),
      algorithms: [config.get<string>('JWT_SIGNING_ALG') || 'HS256'],
      issuer: config.get<string>('JWT_ISSUER') || 'SkillSync_Server',
      audience: config.get<string>('JWT_AUDIENCE') || 'skill-sync',
    });
  }

  async validate(payload: AccessTokenPayload) {
    // Validate token version against current stored version
    const ok = await this.jwtAuthService.validateTokenVersion(payload);
    if (!ok) {
      throw new UnauthorizedException('Token version invalidated');
    }

    // Return a simple user object for request.user
    return {
      id: payload.sub,
      wallet: payload.wallet,
      roles: payload.roles,
      permissions: payload.permissions,
      jti: payload.jti,
    };
  }
}
