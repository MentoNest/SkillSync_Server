import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { randomUUID } from 'crypto';

export interface AccessTokenPayload {
  sub: string;
  wallet: string;
  roles: string[];
  permissions: string[];
  jti: string;
  ver: number;
  iat?: number;
}

@Injectable()
export class JwtAuthService {
  private readonly logger = new Logger(JwtAuthService.name);
  private readonly tokenTtlSeconds: number;
  private readonly jwtIssuer: string;
  private readonly jwtAudience: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    const expires = this.config.get<string>('JWT_ACCESS_EXPIRATION') || '15m';
    this.tokenTtlSeconds = this.parseExpirationToSeconds(expires);
    this.jwtIssuer =
      this.config.get<string>('JWT_ISSUER') || 'SkillSync_Server';
    this.jwtAudience = this.config.get<string>('JWT_AUDIENCE') || 'skill-sync';
  }

  private parseExpirationToSeconds(expiration: string): number {
    if (/^\d+$/.test(expiration)) {
      return parseInt(expiration, 10);
    }

    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 15 * 60;
    }

    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 15 * 60;
    }
  }

  private versionKey(userId: string) {
    return `tokenVersion:${userId}`;
  }

  private invalidationKey(userId: string) {
    return `tokenInvalidatedAt:${userId}`;
  }

  async getTokenVersion(userId: string): Promise<number> {
    const v = await this.redis.get(this.versionKey(userId));
    return v ? parseInt(v, 10) : 0;
  }

  async getTokenInvalidationTimestamp(userId: string): Promise<number | null> {
    const value = await this.redis.get(this.invalidationKey(userId));
    return value ? parseInt(value, 10) : null;
  }

  async incrementTokenVersion(userId: string): Promise<number> {
    const key = this.versionKey(userId);
    const client = this.redis.getClient();
    const val = await client.incr(key);
    await this.redis.expire(key, this.tokenTtlSeconds);
    const now = Math.floor(Date.now() / 1000);
    await this.redis.set(
      this.invalidationKey(userId),
      now.toString(),
      this.tokenTtlSeconds,
    );
    return val;
  }

  async generateAccessToken(opts: {
    userId: string;
    wallet: string;
    roles?: string[];
    permissions?: string[];
  }): Promise<{ accessToken: string; expiresIn: string; jti: string }> {
    const roles = opts.roles || [];
    const permissions = opts.permissions || [];
    const jti = randomUUID();
    const ver = await this.getTokenVersion(opts.userId);

    const payload: AccessTokenPayload = {
      sub: opts.userId,
      wallet: opts.wallet,
      roles,
      permissions,
      jti,
      ver,
    };

    const expiresIn = this.config.get<string>('JWT_ACCESS_EXPIRATION') || '15m';

    const token = await this.jwtService.signAsync(payload, {
      jwtid: jti,
      expiresIn,
      issuer: this.jwtIssuer,
      audience: this.jwtAudience,
    });

    return { accessToken: token, expiresIn, jti };
  }

  async validateTokenVersion(payload: AccessTokenPayload): Promise<boolean> {
    const current = await this.getTokenVersion(payload.sub);
    if (payload.ver !== current) {
      return false;
    }

    const invalidatedAt = await this.getTokenInvalidationTimestamp(payload.sub);
    if (invalidatedAt && payload.iat && payload.iat < invalidatedAt) {
      return false;
    }

    return true;
  }

  async revokeAllSessionsForUser(userId: string): Promise<number> {
    return this.incrementTokenVersion(userId);
  }
}
