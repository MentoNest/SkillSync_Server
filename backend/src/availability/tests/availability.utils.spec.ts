import {
  getUtcDateString,
  getUtcDayOfWeek,
  getUtcTimeString,
  isEndAfterStart,
  isValidTimezone,
  parseTimeToMinutes,
  timeRangesOverlap,
} from '../availability.utils';

describe('availability.utils', () => {
  it('parses HH:mm to minutes', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('10:30')).toBe(630);
  });

  it('detects end after start', () => {
    expect(isEndAfterStart('10:00', '12:00')).toBe(true);
    expect(isEndAfterStart('12:00', '10:00')).toBe(false);
    expect(isEndAfterStart('10:00', '10:00')).toBe(false);
  });

  it('detects overlapping ranges', () => {
    expect(timeRangesOverlap('10:00', '12:00', '11:00', '13:00')).toBe(true);
    expect(timeRangesOverlap('10:00', '12:00', '12:00', '13:00')).toBe(false);
    expect(timeRangesOverlap('10:00', '12:00', '09:00', '10:00')).toBe(false);
  });

  it('extracts UTC date/time/day', () => {
    const dt = new Date('2026-11-23T10:30:00.000Z'); // Monday
    expect(getUtcDateString(dt)).toBe('2026-11-23');
    expect(getUtcTimeString(dt)).toBe('10:30');
    expect(getUtcDayOfWeek(dt)).toBe(1);
  });

  it('validates IANA timezone names', () => {
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });
});
