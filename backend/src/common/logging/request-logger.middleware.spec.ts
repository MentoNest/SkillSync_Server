import { EventEmitter } from 'events';
import {
  createRequestLogger,
  levelForStatus,
  resolveRequestId,
} from './request-logger.middleware';
import {
  REDACTED,
  redact,
  redactHeaders,
  redactString,
  redactUrl,
} from './redact';

function run(
  overrides: {
    status?: number;
    headers?: Record<string, string>;
    body?: unknown;
    error?: Error;
    options?: Parameters<typeof createRequestLogger>[0];
    url?: string;
  } = {},
) {
  const lines: string[] = [];
  const times = [1_000_000_000n, 1_012_345_678n];
  const logger = createRequestLogger({
    write: (line) => lines.push(line),
    hrtime: () => times.shift() ?? 0n,
    production: true,
    ...overrides.options,
  });
  const res = Object.assign(new EventEmitter(), {
    statusCode: overrides.status ?? 200,
    headers: {},
    locals: overrides.error ? { error: overrides.error } : {},
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  });
  const req = {
    method: 'POST',
    originalUrl: overrides.url ?? '/auth/login?x=1',
    headers: { 'user-agent': 'jest', ...(overrides.headers ?? {}) },
    ip: '10.0.0.5',
    body: overrides.body,
  };
  const next = jest.fn();
  logger(req as never, res as never, next);
  res.emit('finish');
  return { lines, res, req, next };
}

describe('createRequestLogger', () => {
  it('logs method, path, status, duration, ip, user agent and a request id as JSON in production', () => {
    const { lines, res, req, next } = run();

    expect(next).toHaveBeenCalledTimes(1);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      level: 'info',
      method: 'POST',
      path: '/auth/login?x=1',
      statusCode: 200,
      durationMs: 12.346,
      ip: '10.0.0.5',
      userAgent: 'jest',
    });
    expect(entry.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['X-Request-Id']).toBe(entry.requestId);
    expect((req as unknown as { id: string }).id).toBe(entry.requestId);
  });

  it('keeps a valid incoming request id and replaces an unusable one', () => {
    expect(
      run({ headers: { 'x-request-id': 'trace-abc-12345' } }).res.headers[
        'X-Request-Id'
      ],
    ).toBe('trace-abc-12345');
    expect(
      run({ headers: { 'x-request-id': 'bad id!' } }).res.headers[
        'X-Request-Id'
      ],
    ).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses info, warn and error for success, client errors and server errors', () => {
    expect(JSON.parse(run({ status: 204 }).lines[0]).level).toBe('info');
    expect(JSON.parse(run({ status: 404 }).lines[0]).level).toBe('warn');
    expect(JSON.parse(run({ status: 503 }).lines[0]).level).toBe('error');
    expect([
      levelForStatus(399),
      levelForStatus(400),
      levelForStatus(499),
      levelForStatus(500),
    ]).toEqual(['info', 'warn', 'warn', 'error']);
  });

  it('writes a readable line outside production and includes the stack for server errors', () => {
    const error = new Error('boom');
    const { lines } = run({
      status: 500,
      error,
      options: { production: false },
    });
    expect(lines[0]).toContain('ERROR POST /auth/login?x=1 500');
    expect(lines[0]).toContain(error.stack!.split('\n')[0]);
  });

  it('never includes a stack trace in production', () => {
    const { lines } = run({ status: 500, error: new Error('boom') });
    const entry = JSON.parse(lines[0]);
    expect(entry.error).toEqual({ message: 'boom' });
    expect(lines[0]).not.toContain('at ');
  });

  it('redacts credentials in headers, bodies and query strings', () => {
    const { lines } = run({
      url: '/cb?token=abc123&page=2',
      headers: {
        authorization: 'Bearer abc.def.ghi',
        cookie: 'sid=1',
        'x-custom': 'ok',
      },
      body: {
        user: 'a',
        password: 'hunter2',
        nested: { refreshToken: 'r', note: 'Bearer xyz123' },
      },
      options: { logHeaders: true, logBody: true },
    });
    const entry = JSON.parse(lines[0]);
    expect(entry.path).toBe(`/cb?token=${REDACTED}&page=2`);
    expect(entry.headers).toMatchObject({
      authorization: REDACTED,
      cookie: REDACTED,
      'x-custom': 'ok',
    });
    expect(entry.body).toEqual({
      user: 'a',
      password: REDACTED,
      nested: { refreshToken: REDACTED, note: `Bearer ${REDACTED}` },
    });
    expect(lines[0]).not.toContain('hunter2');
  });

  it('does not log headers or bodies unless asked to', () => {
    const entry = JSON.parse(
      run({ body: { a: 1 }, headers: { authorization: 'Bearer x' } }).lines[0],
    );
    expect(entry.headers).toBeUndefined();
    expect(entry.body).toBeUndefined();
  });
});

describe('resolveRequestId', () => {
  it('accepts the first value of a repeated header', () => {
    expect(resolveRequestId(['req-12345678', 'other'])).toBe('req-12345678');
  });
});

describe('redaction helpers', () => {
  it('redacts JWTs and Stellar secret keys found in plain strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl';
    const secretKey = `S${'A'.repeat(55)}`;
    expect(redactString(`token=${jwt} key=${secretKey}`)).toBe(
      `token=${REDACTED} key=${REDACTED}`,
    );
  });

  it('does not touch ordinary values and truncates very deep objects', () => {
    expect(redact({ a: [1, 'x', { b: true }] })).toEqual({
      a: [1, 'x', { b: true }],
    });
    let deep: Record<string, unknown> = { leaf: 'secret-free' };
    for (let i = 0; i < 10; i++) deep = { child: deep };
    expect(JSON.stringify(redact(deep))).toContain('[TRUNCATED]');
  });

  it('redacts headers case-insensitively and leaves URLs without a query alone', () => {
    expect(
      redactHeaders({ Authorization: 'Bearer x', Accept: 'json' }),
    ).toEqual({ Authorization: REDACTED, Accept: 'json' });
    expect(redactUrl('/plain/path')).toBe('/plain/path');
  });
});
