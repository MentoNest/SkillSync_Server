import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAccessTokenPayload } from '../interfaces/jwt-payload.interface';

/**
 * #973-974: JWT strategy for validating Bearer tokens.
 * Extracts and verifies JWT from Authorization header.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  async validate(payload: JwtAccessTokenPayload): Promise<JwtAccessTokenPayload> {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return {
      sub: payload.sub,
      wallet: payload.wallet,
      jti: payload.jti,
      iat: payload.iat,
      exp: payload.exp,
      roles: payload.roles || [],
      status: payload.status,
    };
  }
}
