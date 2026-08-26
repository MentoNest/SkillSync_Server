import { Controller, Get, UseGuards, Res, HttpCode, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiProduces } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { RolesGuard } from '../guards/roles.guard';

@ApiTags('Metrics')
@Controller('metrics')
@UseGuards(RolesGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prometheus-compatible metrics endpoint' })
  @ApiProduces('text/plain')
  async getMetrics(@Res() res: Response) {
    const metrics = await this.metricsService.getMetrics();
    res.setHeader('Content-Type', this.metricsService.getContentType());
    res.send(metrics);
  }
}
