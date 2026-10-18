import { HealthService } from './health.service';
import { ShutdownService } from '../shutdown/shutdown.service';

describe('HealthService during shutdown', () => {
  it('returns 503 once shutdown has begun', async () => {
    const shutdown = new ShutdownService();
    const service = new HealthService(undefined, undefined, undefined, shutdown);

    expect((await service.check()).httpStatus).toBe(200);

    shutdown.begin();
    const { report, httpStatus } = await service.check();
    expect(httpStatus).toBe(503);
    expect(report.status).toBe('shutting_down');
  });
});
