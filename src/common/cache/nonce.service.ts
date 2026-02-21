import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class NonceService {
  private readonly logger = new Logger(NonceService.name);

  constructor(private readonly cache: CacheService) {}

  async storeNonce(nonce: string, ttl = 300): Promise<void> {
    try {
      const cacheKey = `nonce:${nonce}`;
      await this.cache.set(cacheKey, '1', ttl);
      this.logger.debug(`Stored nonce ${nonce.substring(0, 8)}... with TTL ${ttl}s`);
    } catch (error) {
      this.logger.error(`Failed to store nonce ${nonce.substring(0, 8)}...:`, error);
      throw error;
    }
  }

  async isNonceValid(nonce: string): Promise<boolean> {
    try {
      const cacheKey = `nonce:${nonce}`;
      const exists = await this.cache.get(cacheKey);
      const isValid = !!exists;
      this.logger.debug(`Nonce ${nonce.substring(0, 8)}... validation: ${isValid}`);
      return isValid;
    } catch (error) {
      this.logger.error(`Failed to validate nonce ${nonce.substring(0, 8)}...:`, error);
      return false;
    }
  }

  async invalidateNonce(nonce: string): Promise<void> {
    try {
      const cacheKey = `nonce:${nonce}`;
      await this.cache.del(cacheKey);
      this.logger.debug(`Invalidated nonce ${nonce.substring(0, 8)}...`);
    } catch (error) {
      this.logger.error(`Failed to invalidate nonce ${nonce.substring(0, 8)}...:`, error);
      throw error;
    }
  }
}
