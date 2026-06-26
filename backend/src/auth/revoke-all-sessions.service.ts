import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RevokeAllSessionsService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly redisService: RedisService,
  ) {}

  async revokeAllForUser(userId: string): Promise<{ revoked: number }> {
    const tokens = await this.refreshTokenRepo.find({
      where: { userId, isActive: true },
    });

    await this.refreshTokenRepo.update({ userId }, { isActive: false });

    for (const token of tokens) {
      if (token.jti) {
        await this.redisService.set(`blacklist:jti:${token.jti}`, '1', 86400);
      }
    }

    await this.redisService.incr(`token_version:${userId}`);

    return { revoked: tokens.length };
  }
}
