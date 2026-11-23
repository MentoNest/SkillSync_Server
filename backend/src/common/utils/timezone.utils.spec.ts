import {
  convertUtcToTimezone,
  formatUtcInTimezone,
  isValidTimezone,
  resolveTimezone,
} from './timezone.utils';

describe('timezone utilities', () => {
  it('converts UTC instants with the correct daylight-saving offset', () => {
    expect(
      convertUtcToTimezone('2026-03-08T06:30:00.000Z', 'America/New_York'),
    ).toBe('2026-03-08T01:30:00.000-05:00');
    expect(
      convertUtcToTimezone('2026-03-08T07:30:00.000Z', 'America/New_York'),
    ).toBe('2026-03-08T03:30:00.000-04:00');
  });

  it('distinguishes the repeated local hour when daylight saving ends', () => {
    expect(
      convertUtcToTimezone('2026-11-01T05:30:00.000Z', 'America/New_York'),
    ).toBe('2026-11-01T01:30:00.000-04:00');
    expect(
      convertUtcToTimezone('2026-11-01T06:30:00.000Z', 'America/New_York'),
    ).toBe('2026-11-01T01:30:00.000-05:00');
  });

  it('formats an instant for display and validates the timezone', () => {
    expect(
      formatUtcInTimezone('2026-11-01T06:30:00.000Z', 'America/New_York'),
    ).toBe('2026-11-01, 01:30 EST');
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });

  it('uses the preference unless a valid response override is provided', () => {
    expect(resolveTimezone('Europe/London')).toBe('Europe/London');
    expect(resolveTimezone('Europe/London', 'America/New_York')).toBe(
      'America/New_York',
    );
    expect(() => resolveTimezone('UTC', 'Mars/Olympus')).toThrow(
      'Accept-Timezone must be a valid IANA timezone.',
    );
  });
});
