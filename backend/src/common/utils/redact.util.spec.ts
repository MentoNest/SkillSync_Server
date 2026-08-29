import { redactSensitiveData } from './redact.util';

describe('redactSensitiveData', () => {
  it('redacts password fields', () => {
    const result = redactSensitiveData({
      email: 'a@b.com',
      password: 'hunter2',
    });
    expect(result).toEqual({ email: 'a@b.com', password: '[REDACTED]' });
  });

  it('redacts authorization and cookie headers', () => {
    const result = redactSensitiveData({
      authorization: 'Bearer abc123',
      cookie: 'session=xyz',
      'x-request-id': 'req-1',
    });
    expect(result).toEqual({
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      'x-request-id': 'req-1',
    });
  });

  it('redacts tokens nested inside objects', () => {
    const result = redactSensitiveData({
      user: { id: 1, refreshToken: 'abc' },
    });
    expect(result).toEqual({ user: { id: 1, refreshToken: '[REDACTED]' } });
  });

  it('redacts values inside arrays', () => {
    const result = redactSensitiveData([{ apiKey: 'secret' }, { name: 'ok' }]);
    expect(result).toEqual([{ apiKey: '[REDACTED]' }, { name: 'ok' }]);
  });

  it('leaves non-sensitive data untouched', () => {
    const input = { id: 1, name: 'Ada', tags: ['a', 'b'] };
    expect(redactSensitiveData(input)).toEqual(input);
  });

  it('handles null and primitive inputs safely', () => {
    expect(redactSensitiveData(null)).toBeNull();
    expect(redactSensitiveData(undefined)).toBeUndefined();
    expect(redactSensitiveData('plain string')).toBe('plain string');
    expect(redactSensitiveData(42)).toBe(42);
  });

  it('handles circular references without throwing', () => {
    const obj: any = { name: 'ok' };
    obj.self = obj;
    expect(() => redactSensitiveData(obj)).not.toThrow();
  });
});
