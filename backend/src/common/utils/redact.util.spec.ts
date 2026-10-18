import { isSensitiveKey, redactSensitiveData } from './redact.util';

describe('redactSensitiveData', () => {
  it('redacts sensitive header names case-insensitively', () => {
    const headers = {
      Authorization: 'Bearer super-secret',
      'x-api-key': 'key-123',
      'set-cookie': 'sid=abc',
      'user-agent': 'jest',
      'x-request-id': 'req-1',
    };

    expect(redactSensitiveData(headers)).toEqual({
      Authorization: '[REDACTED]',
      'x-api-key': '[REDACTED]',
      'set-cookie': '[REDACTED]',
      'user-agent': 'jest',
      'x-request-id': 'req-1',
    });
  });

  it('redacts sensitive body fields at any depth, including arrays', () => {
    const body = {
      email: 'a@b.com',
      password: 'hunter2',
      profile: { accessToken: 'abc', nested: { client_secret: 'shh', keep: 'v' } },
      sessions: [{ refreshToken: 'r', label: 'work' }],
    };

    expect(redactSensitiveData(body)).toEqual({
      email: 'a@b.com',
      password: '[REDACTED]',
      profile: { accessToken: '[REDACTED]', nested: { client_secret: '[REDACTED]', keep: 'v' } },
      sessions: [{ refreshToken: '[REDACTED]', label: 'work' }],
    });
  });

  it('redacts an exact "pin" field without touching unrelated names', () => {
    expect(redactSensitiveData({ pin: '1234', shipping: 'Main St' })).toEqual({
      pin: '[REDACTED]',
      shipping: 'Main St',
    });
  });

  it('handles circular references without infinite recursion', () => {
    const body: Record<string, unknown> = { name: 'loop' };
    body.self = body;

    expect(redactSensitiveData(body)).toEqual({ name: 'loop', self: '[Circular]' });
  });

  it('passes primitives and null through unchanged', () => {
    expect(redactSensitiveData('plain')).toBe('plain');
    expect(redactSensitiveData(42)).toBe(42);
    expect(redactSensitiveData(null)).toBeNull();
    expect(redactSensitiveData(undefined)).toBeUndefined();
  });

  it('keeps Date instances intact', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    expect(redactSensitiveData({ createdAt: date })).toEqual({ createdAt: date });
  });
});

describe('isSensitiveKey', () => {
  it('flags sensitive key variants', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('confirmPassword')).toBe(true);
    expect(isSensitiveKey('X-Auth-Token')).toBe(true);
    expect(isSensitiveKey('api_key')).toBe(true);
    expect(isSensitiveKey('pin')).toBe(true);
  });

  it('does not flag ordinary keys', () => {
    expect(isSensitiveKey('shipping')).toBe(false);
    expect(isSensitiveKey('displayName')).toBe(false);
    expect(isSensitiveKey('walletAddress')).toBe(false);
  });
});
