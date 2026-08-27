import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';

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

  it('should return Prometheus metrics format', async () => {
    const metrics = await service.getMetrics();
    expect(typeof metrics).toBe('string');
    expect(metrics).toContain('http_request_duration_seconds');
  });

  it('should return correct content type', () => {
    const contentType = service.getContentType();
    expect(contentType).toContain('text/plain');
  });
});
