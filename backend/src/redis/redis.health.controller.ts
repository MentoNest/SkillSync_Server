import {
  Controller,
  Get,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { RedisService } from './redis.service';

@ApiTags('Health')
@Controller('health')
export class RedisHealthController {
  constructor(private readonly redis: RedisService) {}

  /** `GET /health/redis`: 200 with the round-trip latency, or 503 when Redis does not answer. */
  @ApiOperation({
    summary: 'Check Redis connectivity',
    description:
      'Returns the round-trip latency of a PING against Redis, or 503 when Redis is unreachable.',
    operationId: 'checkRedisHealth',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Redis answered the PING.',
    schema: {
      type: 'object',
      required: ['status', 'latencyMs'],
      properties: {
        status: { type: 'string', enum: ['up'], example: 'up' },
        latencyMs: { type: 'number', example: 1 },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Redis is not reachable.',
    type: ErrorResponseDto,
  })
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
