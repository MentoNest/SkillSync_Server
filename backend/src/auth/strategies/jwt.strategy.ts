import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * #1145: JWT payload carried by issued access tokens.
 */
export interface JwtPayload {
  sub: string;
  email?: string | null;
  walletAddress?: string | null;
  tokenVersion?: number;
  roles?: string[];
  status?: string; // #1176: account lifecycle status at time of token issuance
}

/**
 * #1145: Passport JWT strategy.
 * Extracts the Bearer token from the Authorization header and validates it
 * against the shared JWT secret. The decoded payload is attached to
 * `request.user` for downstream guards and handlers.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return payload;
  }
}
