import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenService } from './token.service';

export interface DeviceInfo {
  userAgent?: string | null;
  ipAddress?: string | null;
}
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class RefreshTokenService {
  private readonly ttlMs: number;

  constructor(
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tokenService: TokenService,
    config: ConfigService,
  ) {
    this.ttlMs = parseInt(config.get<string>('JWT_REFRESH_TTL_DAYS') ?? '7', 10) * 86_400_000;
  }

  /** Issues a new access + refresh pair, starting a new family unless one is given. */
  async issuePair(user: User, device: DeviceInfo, familyId: string = randomUUID()): Promise<TokenPair> {
    const raw = randomBytes(48).toString('base64url');
    await this.tokens.save(
      this.tokens.create({
        userId: user.id,
        tokenHash: sha256(raw),
        familyId,
        userAgent: device.userAgent?.slice(0, 255) ?? null,
        ipAddress: device.ipAddress ?? null,
        expiresAt: new Date(Date.now() + this.ttlMs),
        revokedAt: null,
      }),
    );
    return {
      accessToken: await this.tokenService.signAccessToken(user),
      refreshToken: raw,
      expiresIn: this.tokenService.accessTtlSeconds,
    };
  }

  /**
   * Rotates a refresh token. Presenting an already-rotated token is treated as theft:
   * the whole family is revoked.
   */
  async rotate(rawToken: string, device: DeviceInfo): Promise<TokenPair> {
    const row = await this.tokens.findOne({ where: { tokenHash: sha256(rawToken) } });
    if (!row) throw new UnauthorizedException('Invalid refresh token');
    if (row.revokedAt) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (row.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('Refresh token expired');

    const user = await this.users.findOne({ where: { id: row.userId } });
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    row.revokedAt = new Date();
    await this.tokens.save(row);
    return this.issuePair(user, device, row.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
