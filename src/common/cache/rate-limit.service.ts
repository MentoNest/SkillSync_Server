import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class RateLimitService {
  constructor(private readonly cache: CacheService) {}

  async increment(ip: string, ttl = 60) {
    return this.cache.increment(`rate:${ip}`, ttl);
  }
}
