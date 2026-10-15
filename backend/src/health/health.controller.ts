import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthReport, HealthService } from './health.service.js';

/**
 * Health endpoints (#1422).
 *
 * `GET /health` returns 200 when every component is healthy and 503 when any
 * is not, so load balancers can act on the status code alone while operators
 * read the per-component breakdown in the body.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.healthService.check();
    res.status(report.status === 'healthy' ? 200 : 503);
    return report;
  }
}
