import {
  httpRequestsTotal,
  httpRequestDuration,
  renderMetrics,
  recordJwtFailure,
  jwtVerificationFailures,
} from './metrics.registry';

describe('metrics registry (#1473)', () => {
  it('renders Prometheus text with required series names', () => {
    httpRequestsTotal.inc({ method: 'GET', path: '/health', status: '200' });
    httpRequestDuration.observe(0.012, { method: 'GET', path: '/health' });
    recordJwtFailure('invalid_signature');

    const text = renderMetrics();
    expect(text).toContain('http_requests_total');
    expect(text).toContain('http_request_duration_seconds');
    expect(text).toContain('db_query_duration_seconds');
    expect(text).toContain('db_connection_pool_size');
    expect(text).toContain('redis_operation_duration_seconds');
    expect(text).toContain('active_users');
    expect(text).toContain('jwt_verification_failures_total');
    expect(jwtVerificationFailures.get({ reason: 'invalid_signature' })).toBeGreaterThan(0);
  });
});
