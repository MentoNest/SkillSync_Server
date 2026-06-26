import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, route } = req;
    const routePath = route?.path ?? req.path ?? 'unknown';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const duration = (Date.now() - start) / 1000;
          this.metricsService.httpRequestsTotal.inc({ method, route: routePath, status_code: res.statusCode });
          this.metricsService.httpRequestDuration.observe({ method, route: routePath }, duration);
        },
        error: () => {
          const duration = (Date.now() - start) / 1000;
          this.metricsService.httpRequestsTotal.inc({ method, route: routePath, status_code: 500 });
          this.metricsService.httpRequestDuration.observe({ method, route: routePath }, duration);
        },
      }),
    );
  }
}
