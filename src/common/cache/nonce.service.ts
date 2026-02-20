import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class NonceService {
  constructor(private readonly cache: CacheService) {}

  async storeNonce(nonce: string, ttl = 300) {
    await this.cache.set(`nonce:${nonce}`, '1', ttl);
  }

  async isNonceValid(nonce: string) {
    const exists = await this.cache.get(`nonce:${nonce}`);
    return !!exists;
  }
}
