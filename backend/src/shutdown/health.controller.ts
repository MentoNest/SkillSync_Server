import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ShutdownService } from './shutdown.service';

@Controller('health')
export class HealthController {
  constructor(private readonly shutdown: ShutdownService) {}

  /** `GET /health`: 200 while serving, 503 while a graceful shutdown is in progress. */
  @Get()
  check(): { status: 'ok' } {
    if (this.shutdown.isShuttingDown()) {
      throw new ServiceUnavailableException({
        status: 'shutting_down',
        message: 'Server is shutting down and no longer accepting requests.',
      });
    }
    return { status: 'ok' };
  }
}
