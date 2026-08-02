import { Injectable, NestMiddleware } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: any, res: any, next: () => void): void {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      this.metricsService.incrementRequestCount(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
      );
      this.metricsService.recordRequestDuration(duration);
    });

    this.metricsService.incrementActiveConnections();
    res.on('close', () => {
      this.metricsService.decrementActiveConnections();
    });

    next();
  }
}
