import { Logger } from '@nestjs/common';
import type { LoginAttempt, SuspiciousLoginDetector, SuspiciousLoginHandler } from './suspicious-login';
import { SuspiciousLoginService } from './suspicious-login.service';

function attempt(overrides: Partial<LoginAttempt> = {}): LoginAttempt {
  return {
    userId: 'u1',
    walletAddress: 'G' + 'A'.repeat(55),
    ipAddress: '203.0.113.9',
    userAgent: 'Mozilla/5.0',
    at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('SuspiciousLoginService', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('does nothing when no detectors are configured', async () => {
    const handler = { handle: jest.fn() } as unknown as SuspiciousLoginHandler;
    const service = new SuspiciousLoginService([], [handler]);

    await service.evaluate(attempt());

    expect(handler.handle).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does nothing when every detector reports no signals', async () => {
    const handler = { handle: jest.fn() } as unknown as SuspiciousLoginHandler;
    const detector = { detect: jest.fn().mockResolvedValue([]) } as unknown as SuspiciousLoginDetector;
    const service = new SuspiciousLoginService([detector], [handler]);

    await service.evaluate(attempt());

    expect(handler.handle).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('forwards the merged signals to every handler', async () => {
    const a = { handle: jest.fn().mockResolvedValue(undefined) } as unknown as SuspiciousLoginHandler;
    const b = { handle: jest.fn().mockResolvedValue(undefined) } as unknown as SuspiciousLoginHandler;
    const d1 = { detect: jest.fn().mockResolvedValue([{ type: 'new_device' }]) } as unknown as SuspiciousLoginDetector;
    const d2 = { detect: jest.fn().mockResolvedValue([{ type: 'new_ip' }]) } as unknown as SuspiciousLoginDetector;

    const service = new SuspiciousLoginService([d1, d2], [a, b]);
    const input = attempt();

    await service.evaluate(input);

    expect(a.handle).toHaveBeenCalledWith(input, [{ type: 'new_device' }, { type: 'new_ip' }]);
    expect(b.handle).toHaveBeenCalledWith(input, [{ type: 'new_device' }, { type: 'new_ip' }]);
    expect(warn).toHaveBeenCalledWith("Suspicious login for user u1: new_device, new_ip");
  });

  it('runs all detectors even when one throws', async () => {
    const handler = { handle: jest.fn().mockResolvedValue(undefined) } as unknown as SuspiciousLoginHandler;
    const failing = {
      detect: jest.fn().mockRejectedValue(new Error('device store unavailable')),
    } as unknown as SuspiciousLoginDetector;
    const working = {
      detect: jest.fn().mockResolvedValue([{ type: 'new_ip' }]),
    } as unknown as SuspiciousLoginDetector;

    const service = new SuspiciousLoginService([failing, working], [handler]);

    // Detection is advisory: a detector failure must not fail the login.
    await expect(service.evaluate(attempt())).resolves.toBeUndefined();
    expect(working.detect).toHaveBeenCalled();
    expect(handler.handle).toHaveBeenCalledWith(expect.anything(), [{ type: 'new_ip' }]);
  });

  it('never rethrows a handler failure', async () => {
    const detector = { detect: jest.fn().mockResolvedValue([{ type: 'new_ip' }]) } as unknown as SuspiciousLoginDetector;
    const failing = {
      handle: jest.fn().mockRejectedValue(new Error('alert webhook 500')),
    } as unknown as SuspiciousLoginHandler;

    const service = new SuspiciousLoginService([detector], [failing]);

    await expect(service.evaluate(attempt())).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('Suspicious login evaluation failed: alert webhook 500');
  });

  it('does not invoke handlers when a detector fails before producing signals', async () => {
    const handler = { handle: jest.fn() } as unknown as SuspiciousLoginHandler;
    const failing = {
      detect: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as SuspiciousLoginDetector;

    const service = new SuspiciousLoginService([failing], [handler]);
    await service.evaluate(attempt());

    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('defaults to empty detector and handler lists', async () => {
    const service = new SuspiciousLoginService();
    await expect(service.evaluate(attempt())).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });
});