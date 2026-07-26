import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenService, DeviceInfo } from './refresh-token.service.js';
import { UsersService } from '../users/users.service.js';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly refreshTokenService: RefreshTokenService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async refresh(
    rawRefreshToken: string,
    deviceInfo: DeviceInfo,
  ): Promise<RefreshResult> {
    const rotated = await this.refreshTokenService.rotate(
      rawRefreshToken,
      deviceInfo,
    );
    const user = await this.usersService.findById(rotated.userId);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      wallet: user.walletAddress,
      jti: randomUUID(),
      roles: user.roles?.map((role) => role.name) ?? [],
    });

    return {
      accessToken,
      refreshToken: rotated.token,
      refreshTokenExpiresAt: rotated.expiresAt,
    };
  }
}
