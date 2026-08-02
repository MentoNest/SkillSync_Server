import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  private counters = {
    http_requests_total: new Map<string, number>(),
    http_request_duration_seconds: [] as number[],
    db_query_duration_seconds: [] as number[],
    jwt_verification_failures_total: 0,
    active_connections: 0,
  };

  incrementRequestCount(method: string, path: string, statusCode: number): void {
    const key = `${method}_${path}_${statusCode}`;
    const current = this.counters.http_requests_total.get(key) || 0;
    this.counters.http_requests_total.set(key, current + 1);
  }

  recordRequestDuration(duration: number): void {
    this.counters.http_request_duration_seconds.push(duration);
    if (this.counters.http_request_duration_seconds.length > 10000) {
      this.counters.http_request_duration_seconds =
        this.counters.http_request_duration_seconds.slice(-5000);
    }
  }

  recordDbQueryDuration(duration: number): void {
    this.counters.db_query_duration_seconds.push(duration);
    if (this.counters.db_query_duration_seconds.length > 10000) {
      this.counters.db_query_duration_seconds =
        this.counters.db_query_duration_seconds.slice(-5000);
    }
  }

  incrementJwtFailures(): void {
    this.counters.jwt_verification_failures_total++;
  }

  incrementActiveConnections(): void {
    this.counters.active_connections++;
  }

  decrementActiveConnections(): void {
    this.counters.active_connections--;
  }

  getMetrics(): string {
    const lines: string[] = [];

    lines.push('# HELP http_requests_total Total number of HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    for (const [key, value] of this.counters.http_requests_total) {
      lines.push(`http_requests_total{${key.replace(/_/g, '="')}} ${value}`);
    }

    lines.push('');
    lines.push('# HELP http_request_duration_seconds HTTP request duration');
    lines.push('# TYPE http_request_duration_seconds histogram');
    const durations = this.counters.http_request_duration_seconds;
    if (durations.length > 0) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const max = Math.max(...durations);
      lines.push(`http_request_duration_seconds_avg ${avg.toFixed(4)}`);
      lines.push(`http_request_duration_seconds_max ${max.toFixed(4)}`);
      lines.push(`http_request_duration_seconds_count ${durations.length}`);
    }

    lines.push('');
    lines.push('# HELP active_connections Number of active connections');
    lines.push('# TYPE active_connections gauge');
    lines.push(`active_connections ${this.counters.active_connections}`);

    lines.push('');
    lines.push('# HELP jwt_verification_failures_total JWT verification failures');
    lines.push('# TYPE jwt_verification_failures_total counter');
    lines.push(
      `jwt_verification_failures_total ${this.counters.jwt_verification_failures_total}`,
    );

    lines.push('');
    lines.push('# HELP db_query_duration_seconds DB query duration');
    lines.push('# TYPE db_query_duration_seconds histogram');
    const dbDurations = this.counters.db_query_duration_seconds;
    if (dbDurations.length > 0) {
      const avg = dbDurations.reduce((a, b) => a + b, 0) / dbDurations.length;
      lines.push(`db_query_duration_seconds_avg ${avg.toFixed(4)}`);
      lines.push(`db_query_duration_seconds_count ${dbDurations.length}`);
    }

    return lines.join('\n');
  }
}
