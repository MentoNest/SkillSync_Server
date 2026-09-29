import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns healthy status when the database responds', async () => {
    const controller = new HealthController({
      query: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as never);

    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      database: 'connected',
    });
  });

  it('returns service unavailable when the database is unreachable', async () => {
    const controller = new HealthController({
      query: vi.fn().mockRejectedValue(new Error('database unavailable')),
    } as never);

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
