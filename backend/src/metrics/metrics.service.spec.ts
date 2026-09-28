import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should record HTTP request metrics', () => {
    service.recordHttpRequest('GET', '/api/users', 200, 0.05);
    // No assertion needed, just ensure it doesn't throw
  });

  it('should record database query metrics', () => {
    service.recordDbQuery('SELECT', 'users', 0.01);
  });

  it('should record Redis operation metrics', () => {
    service.recordRedisOperation('GET', 0.005);
  });

  it('should set active users gauge', () => {
    service.setActiveUsers(42);
  });

  it('should increment JWT failure counter', () => {
    service.incrementJwtFailures('expired');
  });

  it('should export database, Redis, and HTTP error metrics', async () => {
    service.recordDbQuery('SELECT', 'users', 0.01);
    service.setDbConnectionPoolSize(10);
    service.recordRedisOperation('GET', 0.005);
    service.recordHttpRequest('GET', '/users/:id', 500, 0.2);

    const metrics = await service.getMetrics();
    expect(metrics).toContain('db_queries_total');
    expect(metrics).toContain('db_query_duration_seconds');
    expect(metrics).toContain('db_connection_pool_size 10');
    expect(metrics).toContain('redis_operations_total');
    expect(metrics).toContain('redis_operation_duration_seconds');
    expect(metrics).toContain('http_errors_total');
  });

  it('should return Prometheus metrics format', async () => {
    const metrics = await service.getMetrics();
    expect(typeof metrics).toBe('string');
    expect(metrics).toContain('http_request_duration_seconds');
    expect(metrics).toContain('http_requests_total');
    expect(metrics).toContain('active_users');
    expect(metrics).toContain('active_http_connections');
    expect(metrics).toContain('jwt_verification_failures_total');
  });

  it('should update in-flight connection and user gauges once per user', async () => {
    const firstRequest = service.trackHttpRequest('user-1');
    const concurrentRequest = service.trackHttpRequest('user-1');
    const closeConnection = service.trackHttpConnection();

    let metrics = await service.getMetrics();
    expect(metrics).toContain('active_users 1');
    expect(metrics).toContain('active_http_requests 2');
    expect(metrics).toContain('active_http_connections 1');

    firstRequest();
    concurrentRequest();
    concurrentRequest();
    closeConnection();

    metrics = await service.getMetrics();
    expect(metrics).toContain('active_users 0');
    expect(metrics).toContain('active_http_requests 0');
    expect(metrics).toContain('active_http_connections 0');
  });

  it('should return correct content type', () => {
    const contentType = service.getContentType();
    expect(contentType).toContain('text/plain');
  });
});
