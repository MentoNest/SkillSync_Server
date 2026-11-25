import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok while the server is running', () => {
    const controller = new HealthController({
      isShuttingDown: () => false,
    } as never);

    expect(controller.check()).toEqual({ status: 'ok' });
  });

  it('returns 503 while a shutdown is in progress', () => {
    const controller = new HealthController({
      isShuttingDown: () => true,
    } as never);

    let caught: unknown;
    try {
      controller.check();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
  });
});
