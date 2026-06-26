import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Registry, Counter, Histogram } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [this.registry],
  });

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry],
  });

  readonly jwtFailuresTotal = new Counter({
    name: 'jwt_verification_failures_total',
    help: 'Total JWT verification failures',
    registers: [this.registry],
  });

  readonly dbConnectionPoolSize = new Counter({
    name: 'db_query_total',
    help: 'Total database queries executed',
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
