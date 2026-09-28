import { Injectable, Logger } from '@nestjs/common';
import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly register: Registry;

  private readonly httpRequestDuration: Histogram;
  private readonly httpRequestTotal: Counter;
  private readonly dbQueryDuration: Histogram;
  private readonly redisOperationDuration: Histogram;
  private readonly activeUsers: Gauge;
  private readonly jwtVerificationFailures: Counter;

  constructor() {
    this.register = new Registry();

    collectDefaultMetrics({ register: this.register });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });

    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });

    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
      registers: [this.register],
    });

    this.redisOperationDuration = new Histogram({
      name: 'redis_operation_duration_seconds',
      help: 'Duration of Redis operations in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
      registers: [this.register],
    });

    this.activeUsers = new Gauge({
      name: 'active_users',
      help: 'Number of currently active users',
      registers: [this.register],
    });

    this.jwtVerificationFailures = new Counter({
      name: 'jwt_verification_failures_total',
      help: 'Total number of JWT verification failures',
      labelNames: ['reason'],
      registers: [this.register],
    });
  }

  recordHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number) {
    const labels = { method, route, status_code: String(statusCode) };
    this.httpRequestDuration.observe(labels, durationSeconds);
    this.httpRequestTotal.inc(labels);
  }

  recordDbQuery(operation: string, table: string, durationSeconds: number) {
    this.dbQueryDuration.observe({ operation, table }, durationSeconds);
  }

  recordRedisOperation(operation: string, durationSeconds: number) {
    this.redisOperationDuration.observe({ operation }, durationSeconds);
  }

  setActiveUsers(count: number) {
    this.activeUsers.set(count);
  }

  incrementJwtFailures(reason: string) {
    this.jwtVerificationFailures.inc({ reason });
  }

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  getContentType(): string {
    return this.register.contentType;
  }
}
