import { HttpLoggerMiddleware } from './http-logger.middleware';
import { requestContextStorage } from '../contexts/request-id.context';

describe('HttpLoggerMiddleware', () => {
  test('sets X-Request-Id header and exposes requestId in context', (done) => {
    const middleware = new HttpLoggerMiddleware();

    const req: any = { headers: {}, method: 'GET', originalUrl: '/test', socket: { remoteAddress: '127.0.0.1' } };
    const res: any = {
      headers: {},
      setHeader(key: string, value: string) {
        this.headers[key.toLowerCase()] = value;
      },
      getHeader(key: string) {
        return this.headers[key.toLowerCase()];
      },
      on(event: string, cb: Function) {
        if (event === 'finish') {
          // call finish after a tick to let middleware run
          process.nextTick(() => cb());
        }
      },
      statusCode: 200,
    };

    middleware.use(req as any, res as any, () => {
      const ctx = requestContextStorage.getStore();
      try {
        expect(ctx).toBeDefined();
        expect(ctx?.requestId).toBeTruthy();
        // header should be set on request
        expect(req.headers['x-request-id']).toBe(ctx?.requestId);
        // response header set
        expect(res.getHeader('X-Request-Id')).toBe(ctx?.requestId);
        done();
      } catch (err) {
        done(err as Error);
      }
    });
  });
});
