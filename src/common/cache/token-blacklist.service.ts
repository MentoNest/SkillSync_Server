import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class TokenBlacklistService {
  constructor(private readonly cache: CacheService) {}

  async blacklist(token: string, ttl: number) {
    await this.cache.set(`blacklist:${token}`, '1', ttl);
  }

  async isBlacklisted(token: string) {
    const exists = await this.cache.get(`blacklist:${token}`);
    return !!exists;
  }
}
