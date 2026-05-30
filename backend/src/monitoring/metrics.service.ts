import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private requestsTotal = 0;
  private jwtVerificationFailures = 0;

  recordRequest() {
    this.requestsTotal += 1;
  }

  recordJwtVerificationFailure() {
    this.jwtVerificationFailures += 1;
  }

  toPrometheus(): string {
    return [
      '# HELP http_requests_total Total HTTP requests handled',
      '# TYPE http_requests_total counter',
      `http_requests_total ${this.requestsTotal}`,
      '# HELP http_request_duration_seconds HTTP request duration histogram placeholder',
      '# TYPE http_request_duration_seconds histogram',
      'http_request_duration_seconds_bucket{le="1"} 0',
      'http_request_duration_seconds_bucket{le="+Inf"} 0',
      'http_request_duration_seconds_count 0',
      'http_request_duration_seconds_sum 0',
      '# HELP jwt_verification_failures_total JWT verification failures',
      '# TYPE jwt_verification_failures_total counter',
      `jwt_verification_failures_total ${this.jwtVerificationFailures}`,
    ].join('\n');
  }
}
