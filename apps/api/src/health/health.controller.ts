import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthStatus } from '@app/common';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('healthz')
  getHealth(): HealthStatus {
    return this.healthService.check();
  }
}
