import { Injectable, HttpStatus } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.authService.validateToken(payload);
    
    if (!user) {
      throw new BusinessException('Invalid token', ErrorCodes.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }

    return {
      userId: payload.sub,
      walletAddress: payload.walletAddress,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
