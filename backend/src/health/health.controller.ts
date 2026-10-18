import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/guards/jwt-auth.guard';
import { HealthService } from './health.service';

/**
 * Public liveness/readiness endpoint (#1472).
 * Kubernetes probes should target GET /health (no auth).
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const { report, httpStatus } = await this.health.check();
    res.status(httpStatus);
    return report;
  }
}
