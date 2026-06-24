import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from './redis/redis.service';
import { JwtAccessTokenPayload } from './jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async issueAccessToken(userId: string, wallet: string, roles: string[], permissions: string[]): Promise<string> {
    const version = await this.getTokenVersion(userId);
    const jti = uuidv4();
    const payload: JwtAccessTokenPayload = {
      sub: userId,
      wallet,
      roles,
      permissions,
      jti,
      ver: version,
    };

    const algorithm = this.configService.get<string>('JWT_ALGORITHM') || (this.configService.get('JWT_PRIVATE_KEY') ? 'RS256' : 'HS256');
    const signOptions: Record<string, unknown> = { jwtid: jti };

    if (algorithm === 'RS256') {
      const privateKey = this.configService.get<string>('JWT_PRIVATE_KEY');
      if (!privateKey) {
        throw new Error('JWT_PRIVATE_KEY must be configured for RS256 signing');
      }
      signOptions.privateKey = privateKey;
      signOptions.algorithm = 'RS256';
    }

    return this.jwtService.signAsync(payload, signOptions);
  }

  async getTokenVersion(userId: string): Promise<number> {
    const version = await this.redisService.get(userId, 'tokenVersion');
    return version ? Number(version) : 0;
  }

  async incrementTokenVersion(userId: string): Promise<number> {
    const client = this.redisService.getClient();
    const version = await client.incr(`tokenVersion:${userId}`);
    await client.set(`tokenVersionUpdatedAt:${userId}`, Math.floor(Date.now() / 1000).toString());
    return version;
  }

  async getTokenVersionUpdatedAt(userId: string): Promise<number> {
    const timestamp = await this.redisService.get(`tokenVersionUpdatedAt:${userId}`);
    return timestamp ? Number(timestamp) : 0;
  }

  async validateTokenVersion(payload: JwtAccessTokenPayload): Promise<boolean> {
    const currentVersion = await this.getTokenVersion(payload.sub);
    if (payload.ver !== currentVersion) {
      return false;
    }

    const versionUpdatedAt = await this.getTokenVersionUpdatedAt(payload.sub);
    if (versionUpdatedAt && payload.iat && payload.iat < versionUpdatedAt) {
      return false;
    }

    return true;
  }
}
