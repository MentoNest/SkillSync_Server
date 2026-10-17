import { convertToUtc, fromUtc, isValidTimezone, normalizeTimezone, toZoned } from './timezone.util';

describe('timezone.util', () => {
  describe('isValidTimezone', () => {
    it('accepts IANA names', () => {
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
    });

    it('rejects unknown or non-string values', () => {
      expect(isValidTimezone('Not/AZone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone(undefined)).toBe(false);
      expect(isValidTimezone(42)).toBe(false);
    });
  });

  describe('normalizeTimezone', () => {
    it('falls back to UTC for invalid input', () => {
      expect(normalizeTimezone('Not/AZone')).toBe('UTC');
      expect(normalizeTimezone(undefined, 'Europe/London')).toBe('Europe/London');
    });
  });

  describe('convertToUtc', () => {
    it('applies the summer (EDT) offset', () => {
      expect(convertToUtc('2024-07-01T12:00', 'America/New_York').toISOString()).toBe('2024-07-01T16:00:00.000Z');
    });

    it('applies the winter (EST) offset', () => {
      expect(convertToUtc('2024-01-01T12:00', 'America/New_York').toISOString()).toBe('2024-01-01T17:00:00.000Z');
    });

    it('handles the spring-forward boundary', () => {
      expect(convertToUtc('2024-03-10T03:30', 'America/New_York').toISOString()).toBe('2024-03-10T07:30:00.000Z');
    });

    it('rejects an invalid date', () => {
      expect(() => convertToUtc('not-a-date', 'UTC')).toThrow();
    });
  });

  describe('fromUtc / toZoned around DST boundaries', () => {
    it('reflects the post spring-forward offset', () => {
      expect(fromUtc(new Date('2024-03-10T07:00:00Z'), 'America/New_York')).toContain('2024-03-10T03:00:00');
    });

    it('reflects the post fall-back offset', () => {
      expect(fromUtc(new Date('2024-11-03T06:30:00Z'), 'America/New_York')).toContain('2024-11-03T01:30:00');
    });

    it('round-trips a wall-clock time', () => {
      const utc = convertToUtc('2024-11-03T01:30', 'America/New_York');
      expect(toZoned(utc, 'America/New_York').toFormat('HH:mm')).toBe('01:30');
    });
  });
});
