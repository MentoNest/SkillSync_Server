import { createShutdownHandler, rejectDuringShutdown } from './graceful-shutdown';
import { ShutdownService } from './shutdown.service';

const silentLogger = { log: jest.fn(), error: jest.fn() };

function fakeApp(opts: { closeServer?: () => void } = {}) {
  return {
    close: jest.fn().mockResolvedValue(undefined),
    getHttpServer: () => ({
      close: (cb: () => void) => (opts.closeServer ? opts.closeServer() : cb()),
    }),
  } as any;
}

describe('graceful shutdown', () => {
  it('marks the service as shutting down, closes the app and exits 0', async () => {
    const shutdown = new ShutdownService();
    const exit = jest.fn();
    const app = fakeApp();
    const handler = createShutdownHandler({ app, shutdown, exit, logger: silentLogger, timeoutMs: 1000 });

    await handler('SIGTERM');

    expect(shutdown.isShuttingDown()).toBe(true);
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('only runs once when signalled repeatedly', async () => {
    const shutdown = new ShutdownService();
    const exit = jest.fn();
    const app = fakeApp();
    const handler = createShutdownHandler({ app, shutdown, exit, logger: silentLogger });
    await handler('SIGTERM');
    await handler('SIGINT');
    expect(app.close).toHaveBeenCalledTimes(1);
  });

  it('forces exit with code 1 when in-flight requests outlast the timeout', async () => {
    jest.useFakeTimers();
    const shutdown = new ShutdownService();
    const exit = jest.fn();
    const app = fakeApp({ closeServer: () => undefined }); // never finishes draining
    const handler = createShutdownHandler({ app, shutdown, exit, logger: silentLogger, timeoutMs: 500 });

    void handler('SIGTERM');
    await jest.advanceTimersByTimeAsync(600);

    expect(exit).toHaveBeenCalledWith(1);
    jest.useRealTimers();
  });

  it('exits 1 when closing fails', async () => {
    const shutdown = new ShutdownService();
    const exit = jest.fn();
    const app = fakeApp();
    app.close.mockRejectedValue(new Error('db down'));
    const handler = createShutdownHandler({ app, shutdown, exit, logger: silentLogger });
    await handler('SIGTERM');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('rejects new requests with 503 while shutting down', () => {
    const shutdown = new ShutdownService();
    const middleware = rejectDuringShutdown(shutdown);
    const next = jest.fn();
    const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };

    middleware({} as any, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    shutdown.begin();
    middleware({} as any, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
