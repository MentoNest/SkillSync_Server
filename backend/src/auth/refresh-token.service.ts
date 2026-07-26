import { randomBytes, createHash } from 'crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { RefreshToken } from './entities/refresh-token.entity.js';

export interface DeviceInfo {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly configService: ConfigService,
  ) {}

  async issue(
    userId: string,
    deviceInfo: DeviceInfo,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(64).toString('hex');
    const expiresAt = this.computeExpiry();

    const entity = this.refreshTokenRepo.create({
      userId,
      tokenHash: this.hash(token),
      userAgent: deviceInfo.userAgent,
      ipAddress: deviceInfo.ipAddress,
      expiresAt,
    });
    await this.refreshTokenRepo.save(entity);

    return { token, expiresAt };
  }

  async rotate(
    rawToken: string,
    deviceInfo: DeviceInfo,
  ): Promise<RotatedRefreshToken> {
    const tokenHash = this.hash(rawToken);
    const existing = await this.refreshTokenRepo.findOne({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        code: 'invalid_refresh_token',
      });
    }

    if (existing.revokedAt) {
      await this.revokeAllForUser(existing.userId);
      this.logger.warn(
        JSON.stringify({
          event: 'REFRESH_TOKEN_REUSE_DETECTED',
          userId: existing.userId,
          ipAddress: deviceInfo.ipAddress,
          userAgent: deviceInfo.userAgent,
          timestamp: new Date().toISOString(),
        }),
      );
      throw new UnauthorizedException({
        message: 'Refresh token has been revoked',
        code: 'refresh_token_revoked',
      });
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({
        message: 'Refresh token has expired',
        code: 'refresh_token_expired',
      });
    }

    const nextToken = randomBytes(64).toString('hex');
    const nextTokenHash = this.hash(nextToken);
    const expiresAt = this.computeExpiry();

    existing.revokedAt = new Date();
    existing.replacedByTokenHash = nextTokenHash;
    await this.refreshTokenRepo.save(existing);

    const replacement = this.refreshTokenRepo.create({
      userId: existing.userId,
      tokenHash: nextTokenHash,
      userAgent: deviceInfo.userAgent,
      ipAddress: deviceInfo.ipAddress,
      expiresAt,
    });
    await this.refreshTokenRepo.save(replacement);

    return { token: nextToken, expiresAt, userId: existing.userId };
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenRepo.update({ userId }, { revokedAt: new Date() });
  }

  private computeExpiry(): Date {
    const days = this.configService.get<number>(
      'JWT_REFRESH_EXPIRATION_DAYS',
      14,
    );
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
