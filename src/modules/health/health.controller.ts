import { Controller, Get } from '@nestjs/common';
import { SkipRateLimit } from '../../common/decorators/rate-limit.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @SkipRateLimit() // Exempt from rate limiting
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('redis')
  @SkipRateLimit() // Exempt from rate limiting
  redis() {
    return { status: 'redis ok', timestamp: new Date().toISOString() };
  }
}
