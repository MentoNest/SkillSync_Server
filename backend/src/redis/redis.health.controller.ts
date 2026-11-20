import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from './redis.service';

@Controller('health')
export class RedisHealthController {
  constructor(private readonly redis: RedisService) {}

  /** `GET /health/redis`: 200 with the round-trip latency, or 503 when Redis does not answer. */
  @Get('redis')
  async check(): Promise<{ status: 'up'; latencyMs: number }> {
    try {
      return { status: 'up', latencyMs: await this.redis.ping() };
    } catch (error) {
      throw new ServiceUnavailableException(
        `Redis is not reachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
