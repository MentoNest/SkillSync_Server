import { Logger } from '@nestjs/common';
import { DEFAULT_SHUTDOWN_TIMEOUT_MS, ShutdownService } from './shutdown.service';

describe('ShutdownService', () => {
  let exit: jest.Mock;
  let service: ShutdownService;

  const silentLogger = () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  };

  beforeEach(() => {
    exit = jest.fn();
    service = new ShutdownService({ exit });
    silentLogger();
  });

  afterEach(() => {
    service.removeListeners();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('starts running with the default 30 second timeout', () => {
    expect(service.timeout).toBe(DEFAULT_SHUTDOWN_TIMEOUT_MS);
    expect(service.timeout).toBe(30_000);
    expect(service.isShuttingDown()).toBe(false);
    expect(service.isShutdownComplete()).toBe(false);
  });

  it('honours a custom timeout', () => {
    expect(new ShutdownService({ timeoutMs: 5_000, exit }).timeout).toBe(5_000);
  });

  it('closes resources, runs hooks and exits 0 on SIGTERM', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const hook = jest.fn().mockResolvedValue(undefined);
    service.onClose(close);
    service.registerHook('flush-logs', hook);

    await service.shutdown('SIGTERM');

    expect(close).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(service.isShuttingDown()).toBe(true);
    expect(service.isShutdownComplete()).toBe(true);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('attaches SIGTERM and SIGINT handlers that start the shutdown', async () => {
    const handlers = new Map<string, () => void>();
    const onSpy = jest.spyOn(process, 'on').mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      handlers.set(event, handler);
      return process;
    }) as never);
    const close = jest.fn().mockResolvedValue(undefined);
    service.onClose(close);

    service.listen();

    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

    handlers.get('SIGTERM')?.();
    await new Promise((resolve) => setImmediate(resolve));

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);

    onSpy.mockRestore();
  });

  it('does not attach duplicate listeners when listen() is called twice', () => {
    const onSpy = jest.spyOn(process, 'on');
    service.listen();
    service.listen();

    const sigtermRegistrations = onSpy.mock.calls.filter(([event]) => event === 'SIGTERM');
    expect(sigtermRegistrations).toHaveLength(1);

    onSpy.mockRestore();
  });

  it('detaches the signal listeners on removeListeners()', () => {
    const before = process.listenerCount('SIGTERM');
    service.listen();
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);

    service.removeListeners();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });

  it('only shuts down once when several signals arrive', async () => {
    const close = jest.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 10)),
    );
    service.onClose(close);

    const first = service.shutdown('SIGTERM');
    const second = service.shutdown('SIGINT');

    expect(second).toBe(first);
    await first;

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('forces exit with code 1 when the shutdown exceeds the timeout', async () => {
    jest.useFakeTimers();
    service = new ShutdownService({ timeoutMs: 1_000, exit });
    service.onClose(jest.fn(() => new Promise<void>(() => undefined)));

    void service.shutdown('SIGTERM');
    await jest.advanceTimersByTimeAsync(1_000);

    expect(exit).toHaveBeenCalledWith(1);
    expect(service.isShutdownComplete()).toBe(false);
  });

  it('continues with the remaining hooks when one hook fails', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('boom'));
    const following = jest.fn().mockResolvedValue(undefined);
    service.onClose(jest.fn().mockResolvedValue(undefined));
    service.registerHook('failing', failing);
    service.registerHook('following', following);

    await service.shutdown('SIGTERM');

    expect(failing).toHaveBeenCalledTimes(1);
    expect(following).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('forces exit with code 1 when closing the application throws', async () => {
    service.onClose(jest.fn().mockRejectedValue(new Error('close failed')));

    await service.shutdown('SIGTERM');

    expect(exit).toHaveBeenCalledWith(1);
    expect(service.isShutdownComplete()).toBe(false);
  });

  it('still shuts down when no close handler was registered', async () => {
    await service.shutdown('SIGTERM');

    expect(service.isShutdownComplete()).toBe(true);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
