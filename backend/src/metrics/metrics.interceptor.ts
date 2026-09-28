import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, finalize, throwError } from 'rxjs';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method ?? 'UNKNOWN';
    const routePath = request.route?.path;
    const route =
      typeof routePath === 'string'
        ? `${request.baseUrl ?? ''}${routePath}`
        : '/unmatched';
    const startedAt = process.hrtime.bigint();
    const finishTracking = this.metricsService.trackHttpRequest(
      request.user?.sub ?? request.user?.id,
    );

    return next.handle().pipe(
      catchError((error: unknown) => {
        response.statusCode =
          error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        const durationSeconds =
          Number(process.hrtime.bigint() - startedAt) / 1e9;
        this.metricsService.recordHttpRequest(
          method,
          route,
          response.statusCode,
          durationSeconds,
        );
        finishTracking();
      }),
    );
  }
}
