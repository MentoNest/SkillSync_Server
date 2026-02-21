import { Controller, Get, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './providers/redis.provider';

@Controller('health/redis')
export class RedisHealthController {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const pong = await this.redis.ping();
    return { status: pong === 'PONG' ? 'up' : 'down' };
  }
}
