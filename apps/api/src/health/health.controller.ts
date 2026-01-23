// import { Controller, Get } from '@nestjs/common';
// import { HealthService } from './health.service';
// import type { HealthStatus } from '@app/common';

// @Controller()
// export class HealthController {
//   constructor(private readonly healthService: HealthService) {}

//   @Get('healthz')
//   getHealth(): HealthStatus {
//     return this.healthService.check();
//   }
// }

import { Controller, Get, HttpCode } from '@nestjs/common';
import { HealthService } from './health.service';
import type { LivenessResponse, ReadinessResponse } from './health.interface';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('healthz')
  getLiveness(): LivenessResponse {
    return this.healthService.getLiveness();
  }

  @Get('readyz')
  @HttpCode(200)
  async getReadiness(): Promise<ReadinessResponse> {
    return this.healthService.getReadiness();
  }
}
