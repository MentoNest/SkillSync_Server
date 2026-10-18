import { HealthService } from './health.service';

describe('HealthService (#1472)', () => {
  it('returns ok when database and redis respond', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const service = new HealthService(dataSource as any, redis as any);
    const { report, httpStatus } = await service.check();
    expect(httpStatus).toBe(200);
    expect(report.status).toBe('ok');
    expect(report.components.database.status).toBe('up');
    expect(report.components.redis.status).toBe('up');
    expect(report.timestamp).toBeTruthy();
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('returns 503 when database is down', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const service = new HealthService(dataSource as any, redis as any);
    const { report, httpStatus } = await service.check();
    expect(httpStatus).toBe(503);
    expect(report.status).toBe('error');
    expect(report.components.database.status).toBe('down');
  });

  it('returns 503 when redis ping fails', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([1]),
    };
    const redis = { ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const service = new HealthService(dataSource as any, redis as any);
    const { httpStatus, report } = await service.check();
    expect(httpStatus).toBe(503);
    expect(report.components.redis.status).toBe('down');
  });
});
