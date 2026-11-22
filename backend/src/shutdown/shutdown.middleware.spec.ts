import { Logger } from '@nestjs/common';
import { createShutdownMiddleware } from './shutdown.middleware';

function makeResponse() {
  const res = {
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('createShutdownMiddleware', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes the request through while the server is running', () => {
    const next = jest.fn();
    const middleware = createShutdownMiddleware({ isShuttingDown: () => false } as never);

    middleware({ method: 'GET', originalUrl: '/' } as never, makeResponse() as never, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects with 503 while the server is shutting down', () => {
    const next = jest.fn();
    const res = makeResponse();
    const middleware = createShutdownMiddleware({ isShuttingDown: () => true } as never);

    middleware({ method: 'POST', originalUrl: '/users' } as never, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'close');
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503, error: 'Service Unavailable' }),
    );
  });
});
