import { requestLoggingMiddleware } from './logging.middleware';

function createMockReq(overrides: Partial<any> = {}): any {
  return {
    headers: { 'user-agent': 'jest-test' },
    method: 'GET',
    originalUrl: '/api/v1/things',
    path: '/api/v1/things',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

function createMockRes(): any {
  const listeners: Record<string, Function[]> = {};
  return {
    statusCode: 200,
    setHeader: jest.fn(),
    on: jest.fn((event: string, cb: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    emitFinish() {
      (listeners['finish'] || []).forEach((cb) => cb());
    },
  };
}

describe('requestLoggingMiddleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('generates a request ID and echoes it back as a response header', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = jest.fn();

    requestLoggingMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('reuses an inbound X-Request-Id header instead of generating a new one', () => {
    const req = createMockReq({
      headers: { 'x-request-id': 'inbound-id', 'user-agent': 'jest' },
    });
    const res = createMockRes();

    requestLoggingMiddleware(req, res, jest.fn());

    expect(req.requestId).toBe('inbound-id');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'inbound-id');
  });

  it('populates req.context for downstream consumers (e.g. @RequestContext())', () => {
    const req = createMockReq();
    const res = createMockRes();

    requestLoggingMiddleware(req, res, jest.fn());

    expect(req.context).toMatchObject({
      requestId: req.requestId,
      method: 'GET',
      path: '/api/v1/things',
      ip: '127.0.0.1',
    });
  });

  it('logs a line when the response finishes', () => {
    const req = createMockReq();
    const res = createMockRes();
    const logSpy = jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'log')
      .mockImplementation();

    requestLoggingMiddleware(req, res, jest.fn());
    res.statusCode = 200;
    res.emitFinish();

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('logs at warn level for 4xx responses', () => {
    const req = createMockReq();
    const res = createMockRes();
    const warnSpy = jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'warn')
      .mockImplementation();

    requestLoggingMiddleware(req, res, jest.fn());
    res.statusCode = 404;
    res.emitFinish();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs at error level for 5xx responses', () => {
    const req = createMockReq();
    const res = createMockRes();
    const errorSpy = jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'error')
      .mockImplementation();

    requestLoggingMiddleware(req, res, jest.fn());
    res.statusCode = 500;
    res.emitFinish();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('emits structured JSON in production and redacts sensitive headers', () => {
    process.env.NODE_ENV = 'production';
    const req = createMockReq({
      headers: { 'user-agent': 'jest', authorization: 'Bearer secret-token' },
    });
    const res = createMockRes();
    const logSpy = jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'log')
      .mockImplementation();

    requestLoggingMiddleware(req, res, jest.fn());
    res.statusCode = 200;
    res.emitFinish();

    const loggedLine = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(loggedLine);
    expect(parsed.statusCode).toBe(200);
    expect(parsed.requestId).toBe(req.requestId);
    expect(parsed.headers.authorization).toBe('[REDACTED]');

    logSpy.mockRestore();
  });
});
