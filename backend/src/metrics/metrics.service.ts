import { Injectable, Logger } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Gauge,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly register: Registry;

  private readonly httpRequestDuration: Histogram;
  private readonly httpRequestTotal: Counter;
  private readonly httpErrorsTotal: Counter;
  private readonly dbQueryDuration: Histogram;
  private readonly dbQueriesTotal: Counter;
  private readonly dbConnectionPoolSize: Gauge;
  private readonly redisOperationDuration: Histogram;
  private readonly redisOperationsTotal: Counter;
  private readonly activeUsers: Gauge;
  private readonly activeConnections: Gauge;
  private readonly activeHttpRequests: Gauge;
  private readonly jwtVerificationFailures: Counter;
  private readonly activeUserRequests = new Map<string, number>();

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

    this.httpErrorsTotal = new Counter({
      name: 'http_errors_total',
      help: 'Total number of HTTP requests that resulted in a server error',
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

    this.dbQueriesTotal = new Counter({
      name: 'db_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation', 'table'],
      registers: [this.register],
    });

    this.dbConnectionPoolSize = new Gauge({
      name: 'db_connection_pool_size',
      help: 'Configured maximum number of database connections in the pool',
      registers: [this.register],
    });

    this.redisOperationDuration = new Histogram({
      name: 'redis_operation_duration_seconds',
      help: 'Duration of Redis operations in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
      registers: [this.register],
    });

    this.redisOperationsTotal = new Counter({
      name: 'redis_operations_total',
      help: 'Total number of Redis operations',
      labelNames: ['operation'],
      registers: [this.register],
    });

    this.activeUsers = new Gauge({
      name: 'active_users',
      help: 'Number of distinct authenticated users with in-flight requests',
      registers: [this.register],
    });

    this.activeConnections = new Gauge({
      name: 'active_http_connections',
      help: 'Number of currently open HTTP server connections',
      registers: [this.register],
    });

    this.activeHttpRequests = new Gauge({
      name: 'active_http_requests',
      help: 'Number of HTTP requests currently being handled',
      registers: [this.register],
    });

    this.jwtVerificationFailures = new Counter({
      name: 'jwt_verification_failures_total',
      help: 'Total number of JWT verification failures',
      labelNames: ['reason'],
      registers: [this.register],
    });
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ) {
    const labels = { method, route, status_code: String(statusCode) };
    this.httpRequestDuration.observe(labels, durationSeconds);
    this.httpRequestTotal.inc(labels);
    if (statusCode >= 500) {
      this.httpErrorsTotal.inc(labels);
    }
  }

  recordDbQuery(operation: string, table: string, durationSeconds: number) {
    this.dbQueriesTotal.inc({ operation, table });
    this.dbQueryDuration.observe({ operation, table }, durationSeconds);
  }

  recordDbQueryCount(operation: string, table: string) {
    this.dbQueriesTotal.inc({ operation, table });
  }

  recordDbQueryDuration(
    operation: string,
    table: string,
    durationSeconds: number,
  ) {
    this.dbQueryDuration.observe({ operation, table }, durationSeconds);
  }

  setDbConnectionPoolSize(size: number) {
    this.dbConnectionPoolSize.set(size);
  }

  recordRedisOperation(operation: string, durationSeconds: number) {
    this.redisOperationsTotal.inc({ operation });
    this.redisOperationDuration.observe({ operation }, durationSeconds);
  }

  trackHttpRequest(userId?: string): () => void {
    this.activeHttpRequests.inc();
    if (userId) {
      this.activeUserRequests.set(
        userId,
        (this.activeUserRequests.get(userId) ?? 0) + 1,
      );
      this.activeUsers.set(this.activeUserRequests.size);
    }

    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.activeHttpRequests.dec();

      if (userId) {
        const remainingRequests =
          (this.activeUserRequests.get(userId) ?? 1) - 1;
        if (remainingRequests === 0) {
          this.activeUserRequests.delete(userId);
        } else {
          this.activeUserRequests.set(userId, remainingRequests);
        }
        this.activeUsers.set(this.activeUserRequests.size);
      }
    };
  }

  trackHttpConnection(): () => void {
    this.activeConnections.inc();
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      this.activeConnections.dec();
    };
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
