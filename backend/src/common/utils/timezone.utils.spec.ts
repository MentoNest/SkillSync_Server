import {
  isValidIanaTimezone,
  utcToTimezone,
  timezoneToUtc,
  formatWithTimezone,
} from './timezone.utils';

describe('isValidIanaTimezone', () => {
  it('accepts valid IANA timezones', () => {
    expect(isValidIanaTimezone('UTC')).toBe(true);
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
    expect(isValidIanaTimezone('Europe/London')).toBe(true);
    expect(isValidIanaTimezone('Asia/Tokyo')).toBe(true);
  });

  it('rejects invalid timezone strings', () => {
    expect(isValidIanaTimezone('Not/ATimezone')).toBe(false);
    expect(isValidIanaTimezone('')).toBe(false);
    expect(isValidIanaTimezone('Bogus/NotReal')).toBe(false);
  });
});

describe('utcToTimezone', () => {
  it('converts UTC date to local time string', () => {
    // 2024-01-01T00:00:00Z in UTC === 2023-12-31T19:00:00 in America/New_York (UTC-5)
    const utc = new Date('2024-01-01T00:00:00Z');
    const result = utcToTimezone(utc, 'America/New_York');
    expect(result).toBe('2023-12-31T19:00:00');
  });

  it('returns same time for UTC timezone', () => {
    const utc = new Date('2024-06-15T12:30:00Z');
    const result = utcToTimezone(utc, 'UTC');
    expect(result).toBe('2024-06-15T12:30:00');
  });

  it('throws for invalid timezone', () => {
    expect(() => utcToTimezone(new Date(), 'Bad/Zone')).toThrow();
  });
});

describe('formatWithTimezone', () => {
  it('returns utc, local, and timezone fields', () => {
    const utc = new Date('2024-03-10T12:00:00Z');
    const result = formatWithTimezone(utc, 'UTC');
    expect(result.utc).toBe(utc.toISOString());
    expect(result.timezone).toBe('UTC');
    expect(result.local).toBeDefined();
  });

  it('falls back to UTC string for invalid timezone', () => {
    const utc = new Date('2024-03-10T12:00:00Z');
    const result = formatWithTimezone(utc, 'Bad/Zone');
    expect(result.local).toBe(utc.toISOString());
  });
});
