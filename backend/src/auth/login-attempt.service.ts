import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class LoginAttemptService {
  constructor(private readonly redisService: RedisService) {}

  async incrementAttempts(wallet: string): Promise<number> {
    const key = `loginAttempts:${wallet}`;
    const client = this.redisService.getClient();
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, 15 * 60);
    }
    return count;
  }

  async resetAttempts(wallet: string): Promise<void> {
    await this.redisService.del(wallet, 'loginAttempts');
  }

  async getAttempts(wallet: string): Promise<number> {
    const value = await this.redisService.get(wallet, 'loginAttempts');
    return value ? Number(value) : 0;
  }
}
