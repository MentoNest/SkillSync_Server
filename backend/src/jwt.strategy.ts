import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAccessTokenPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService, private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JwtStrategy.createSecret(configService),
      algorithms: [configService.get('JWT_ALGORITHM') || 'HS256'],
    });
  }

  private static createSecret(configService: ConfigService): string {
    const algorithm = configService.get('JWT_ALGORITHM') || (configService.get('JWT_PRIVATE_KEY') ? 'RS256' : 'HS256');
    if (algorithm === 'RS256') {
      const publicKey = configService.get<string>('JWT_PUBLIC_KEY');
      if (!publicKey) {
        throw new Error('JWT_PUBLIC_KEY is required for RS256 verification');
      }
      return publicKey;
    }

    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is required for HS256 verification');
    }

    return secret;
  }

  async validate(payload: JwtAccessTokenPayload): Promise<JwtAccessTokenPayload> {
    if (!payload.sub || !payload.wallet || !payload.jti) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const validVersion = await this.authService.validateTokenVersion(payload);
    if (!validVersion) {
      throw new UnauthorizedException('Token version invalidated');
    }

    return payload;
  }
}
