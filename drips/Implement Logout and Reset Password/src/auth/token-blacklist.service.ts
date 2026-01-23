import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class TokenBlacklistService {
  private readonly BLACKLIST_PREFIX = "blacklist:token:";
  private readonly USER_SESSION_PREFIX = "user:sessions:";

  constructor(private readonly redisService: RedisService) {}

  async blacklistToken(token: string, expiresIn: number): Promise<void> {
    const key = `${this.BLACKLIST_PREFIX}${token}`;
    // Store with the remaining TTL of the original token
    await this.redisService.set(key, "1", expiresIn);
  }

  async isBlacklisted(token: string): Promise<boolean> {
    const key = `${this.BLACKLIST_PREFIX}${token}`;
    const result = await this.redisService.get(key);
    return result !== null;
  }

  async invalidateUserSessions(userId: string): Promise<void> {
    const key = `${this.USER_SESSION_PREFIX}${userId}`;
    // Set a flag that can be checked during token validation
    await this.redisService.set(key, Date.now().toString(), 3600); // 1 hour
  }

  async isUserSessionInvalidated(
    userId: string,
    tokenIssuedAt: number,
  ): Promise<boolean> {
    const key = `${this.USER_SESSION_PREFIX}${userId}`;
    const invalidatedAt = await this.redisService.get(key);

    if (!invalidatedAt) {
      return false;
    }

    // Check if token was issued before invalidation
    return tokenIssuedAt < parseInt(invalidatedAt, 10);
  }
}
