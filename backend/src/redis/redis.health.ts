import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { RedisService } from './redis.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redisService: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.redisService.ping();
      const isHealthy = pong === 'PONG';
      const result = this.getStatus(key, isHealthy);
      if (!isHealthy) throw new HealthCheckError('Redis ping failed', result);
      return result;
    } catch (err) {
      const result = this.getStatus(key, false, { message: (err as Error).message });
      throw new HealthCheckError('Redis unreachable', result);
    }
  }
}
