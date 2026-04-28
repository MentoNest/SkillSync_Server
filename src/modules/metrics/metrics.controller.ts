import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';
import { BasicAuthGuard } from './basic-auth.guard';

@ApiTags('Metrics')
@Controller()
export class MetricsController extends PrometheusController {
  constructor(private readonly metricsService: MetricsService) {
    super();
  }

  @Get('/metrics')
  @UseGuards(BasicAuthGuard)
  @ApiOperation({
    summary: 'Get Prometheus metrics',
    description: 'Returns Prometheus-compatible metrics for monitoring and alerting.',
  })
  @ApiResponse({
    status: 200,
    description: 'Prometheus metrics in text format',
    content: {
      'text/plain': {
        example: '# HELP http_requests_total Total number of HTTP requests\n# TYPE http_requests_total counter\nhttp_requests_total{method="GET",status="200"} 42\n',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid credentials',
  })
  async getMetrics() {
    return super.index();
  }
}