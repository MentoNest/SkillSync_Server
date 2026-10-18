import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/user-status/user-status.enum';

export interface AccessTokenClaims {
  sub: string;
  wallet: string;
  roles: string[];
  permissions: string[];
  status: UserStatus;
  ver: number;
  jti: string;
}

@Injectable()
export class TokenService {
  readonly accessTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessTtlSeconds = parseInt(config.get<string>('JWT_ACCESS_TTL_SECONDS') ?? '900', 10);
  }

  /** Signs an access token (iss/aud/iat/exp come from JwtModule options). */
  signAccessToken(user: User, roles: string[] = [], permissions: string[] = []): Promise<string> {
    const claims: AccessTokenClaims = {
      sub: user.id,
      wallet: user.walletAddress,
      roles,
      permissions,
      status: user.status ?? UserStatus.ACTIVE,
      ver: user.tokenVersion,
      jti: randomUUID(),
    };
    return this.jwt.signAsync(claims, { expiresIn: this.accessTtlSeconds });
  }
}
