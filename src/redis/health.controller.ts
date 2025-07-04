import { Controller, Get } from '@nestjs/common';
import { RedisService } from './providers/cache.service';

@Controller('health')
export class HealthController {
  constructor(private redisService: RedisService) {}

  @Get('redis')
  async checkRedisHealth() {
    const isHealthy = await this.redisService.healthCheck();
    return {
      service: 'redis',
      status: isHealthy ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }
}
