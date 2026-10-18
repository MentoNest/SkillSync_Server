import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { requestLoggingMiddleware } from './request-logging.middleware';

interface MockResponse extends EventEmitter {
  statusCode: number;
  locals: Record<string, unknown>;
  setHeader: jest.Mock;
}

function createResponse(statusCode = 200): MockResponse {
  const res = new EventEmitter() as MockResponse;
  res.statusCode = statusCode;
  res.locals = {};
  res.setHeader = jest.fn();
  return res;
}

function createRequest(overrides: Partial<Record<string, unknown>> = {}): Request {
  return {
    method: 'POST',
    path: '/auth/login',
    originalUrl: '/auth/login',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'jest-agent' },
    body: { email: 'a@b.com', password: 'hunter2' },
    ...overrides,
  } as unknown as Request;
}

describe('requestLoggingMiddleware', () => {
  const originalEnv = process.env;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('propagates an inbound X-Request-Id, echoes it and calls next', () => {
    const req = createRequest({ headers: { 'x-request-id': 'trace-1', 'user-agent': 'jest-agent' } });
    const res = createResponse();
    const next = jest.fn();

    requestLoggingMiddleware(req, res as unknown as Response, next as NextFunction);

    expect((req as { requestId?: string }).requestId).toBe('trace-1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'trace-1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a unique request id when none is provided', () => {
    const req = createRequest();
    const res = createResponse();

    requestLoggingMiddleware(req, res as unknown as Response, jest.fn() as NextFunction);

    const requestId = (req as { requestId?: string }).requestId;
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', requestId);
  });

  it('emits structured JSON in production with redacted headers and body', () => {
    process.env.NODE_ENV = 'production';
    const req = createRequest({
      headers: {
        'user-agent': 'jest-agent',
        authorization: 'Bearer secret-token',
        'x-request-id': 'trace-2',
      },
      body: { email: 'a@b.com', password: 'hunter2', profile: { apiKey: 'k', keep: 'v' } },
      user: { sub: 'user-1' },
    });
    const res = createResponse();

    requestLoggingMiddleware(req, res as unknown as Response, jest.fn() as NextFunction);
    res.emit('finish');

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.method).toBe('POST');
    expect(parsed.path).toBe('/auth/login');
    expect(parsed.statusCode).toBe(200);
    expect(parsed.ip).toBe('127.0.0.1');
    expect(parsed.userAgent).toBe('jest-agent');
    expect(parsed.requestId).toBe('trace-2');
    expect(parsed.userId).toBe('user-1');
    expect(typeof parsed.durationMs).toBe('number');
    expect(parsed.headers.authorization).toBe('[REDACTED]');
    expect(parsed.headers['user-agent']).toBe('jest-agent');
    expect(parsed.body.password).toBe('[REDACTED]');
    expect(parsed.body.email).toBe('a@b.com');
    expect(parsed.body.profile.apiKey).toBe('[REDACTED]');
    expect(parsed.body.profile.keep).toBe('v');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('emits a compact readable line in development', () => {
    process.env.NODE_ENV = 'development';
    const req = createRequest();
    const res = createResponse(201);

    requestLoggingMiddleware(req, res as unknown as Response, jest.fn() as NextFunction);
    res.emit('finish');

    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('POST /auth/login 201');
    expect(line).toContain('ms [');
    expect(() => JSON.parse(line)).toThrow();
  });

  it('logs 4xx responses at warn level and 5xx responses at error level', () => {
    const warnReq = createRequest();
    const warnRes = createResponse(404);
    requestLoggingMiddleware(warnReq, warnRes as unknown as Response, jest.fn() as NextFunction);
    warnRes.emit('finish');

    const errorReq = createRequest();
    const errorRes = createResponse(500);
    requestLoggingMiddleware(errorReq, errorRes as unknown as Response, jest.fn() as NextFunction);
    errorRes.emit('finish');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('includes the error stack in development only', () => {
    const req = createRequest();
    const res = createResponse(500);
    res.locals.errorStack = 'Error: boom\n    at x';

    process.env.NODE_ENV = 'development';
    requestLoggingMiddleware(req, res as unknown as Response, jest.fn() as NextFunction);
    res.emit('finish');
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), 'Error: boom\n    at x');

    errorSpy.mockClear();
    process.env.NODE_ENV = 'production';
    const prodReq = createRequest();
    const prodRes = createResponse(500);
    prodRes.locals.errorStack = 'Error: boom\n    at x';
    requestLoggingMiddleware(prodReq, prodRes as unknown as Response, jest.fn() as NextFunction);
    prodRes.emit('finish');
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String));
  });
});
