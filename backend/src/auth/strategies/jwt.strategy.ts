import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../auth.service';
import { JwtAccessTokenPayload } from '../../jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JwtStrategy.resolveSecret(configService),
      algorithms: [configService.get<string>('JWT_ALGORITHM') || 'HS256'],
    });
  }

  private static resolveSecret(config: ConfigService): string {
    const algorithm =
      config.get('JWT_ALGORITHM') || (config.get('JWT_PRIVATE_KEY') ? 'RS256' : 'HS256');
    if (algorithm === 'RS256') {
      const pub = config.get<string>('JWT_PUBLIC_KEY');
      if (!pub) throw new Error('JWT_PUBLIC_KEY is required for RS256 verification');
      return pub;
    }
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is required for HS256 verification');
    return secret;
  }

  async validate(payload: JwtAccessTokenPayload): Promise<JwtAccessTokenPayload> {
    if (!payload.sub || !payload.wallet || !payload.jti) {
      throw new UnauthorizedException('Invalid token payload');
    }
    const valid = await this.authService.validateTokenVersion(payload);
    if (!valid) throw new UnauthorizedException('Token version invalidated');
    return payload;
  }
}
