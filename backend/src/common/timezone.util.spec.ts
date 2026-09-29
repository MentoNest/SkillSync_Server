/**
 * #1337: timezone handling - IANA validation and UTC -> local conversion.
 *
 * The backend deliberately avoids a date library and uses the built-in `Intl`
 * API, so the behaviour under test is what Node's ICU data does. The issue
 * asks specifically for DST boundary coverage, which is where timezone bugs
 * actually bite: a fixed offset would pass a mid-summer test and fail in March.
 *
 * Two separate validators exist and they do not agree:
 *
 * - `timezone.util.isValidTimezone` asks `Intl.DateTimeFormat` whether it can
 *   construct a formatter, so it accepts 'UTC' as well as named zones.
 * - `IsValidTimezoneConstraint` checks membership of
 *   `Intl.supportedValuesOf('timeZone')`, which is a list of *canonical named
 *   zones only* and does **not** contain 'UTC'.
 *
 * That divergence is asserted explicitly below rather than papered over, so
 * the two helpers cannot drift further apart unnoticed.
 */
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import {
  DEFAULT_TIMEZONE,
  formatInTimezone,
  isValidTimezone,
} from './timezone.util.js';
import {
  IsValidTimezone,
  IsValidTimezoneConstraint,
} from './validators/is-valid-timezone.validator.js';

const constraint = new IsValidTimezoneConstraint();

/** Mirrors the `validate` signature so the helper can call it directly. */
const noArgs = {} as never;

function isValidByConstraint(timezone: string): boolean {
  return constraint.validate(timezone, noArgs);
}

describe('isValidTimezone (Intl-based)', () => {
  it.each([
    'UTC',
    'America/New_York',
    'Europe/London',
    'Asia/Tokyo',
    'Australia/Sydney',
    'America/Sao_Paulo',
  ])('accepts %s', (zone) => {
    expect(isValidTimezone(zone)).toBe(true);
  });

  it.each(['Not/AZone', 'Mars/Olympus', 'GMT+25', 'America Now York', 'utc '])(
    'rejects %s',
    (zone) => {
      expect(isValidTimezone(zone)).toBe(false);
    },
  );

  it('rejects an empty string', () => {
    expect(isValidTimezone('')).toBe(false);
  });
});

describe('IsValidTimezoneConstraint (supportedValuesOf-based)', () => {
  it.each(['America/New_York', 'Europe/London', 'Asia/Tokyo'])(
    'accepts %s',
    (zone) => {
      expect(isValidByConstraint(zone)).toBe(true);
    },
  );

  it.each(['Not/AZone', '', 'Mars/Olympus'])('rejects %s', (zone) => {
    expect(isValidByConstraint(zone)).toBe(false);
  });

  it('rejects UTC even though the user entity documents UTC as the default', () => {
    // Intl.supportedValuesOf('timeZone') lists canonical named zones only, so
    // 'UTC' is absent. This is a real divergence from isValidTimezone() in
    // timezone.util.ts, which does accept it, and it is why a user whose
    // timezone is left at the DEFAULT_TIMEZONE default would be rejected by a
    // DTO carrying @IsValidTimezone(). Pinned here so the behaviour is visible.
    expect(isValidByConstraint('UTC')).toBe(false);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(DEFAULT_TIMEZONE).toBe('UTC');
  });
});

describe('formatInTimezone - UTC storage rendered in another zone', () => {
  it('formats the same instant differently for two zones', () => {
    // 2026-01-15T15:00:00Z - mid-winter, so both zones are on standard time.
    // The util formats with en-US + timeStyle: 'short', i.e. 12-hour clock.
    const instant = new Date('2026-01-15T15:00:00Z');

    const utc = formatInTimezone(instant, 'UTC');
    const newYork = formatInTimezone(instant, 'America/New_York');

    expect(utc).toContain('3:00 PM');
    // New York is UTC-5 in January.
    expect(newYork).toContain('10:00 AM');
  });

  it('is deterministic for the same input', () => {
    const instant = new Date('2026-06-01T12:00:00Z');

    expect(formatInTimezone(instant, 'Europe/London')).toBe(
      formatInTimezone(instant, 'Europe/London'),
    );
  });

  it('falls back to UTC for an invalid zone instead of throwing', () => {
    const instant = new Date('2026-01-15T15:00:00Z');

    expect(formatInTimezone(instant, 'Not/AZone')).toBe(
      formatInTimezone(instant, 'UTC'),
    );
  });

  it('renders the calendar date, which can differ across the date line', () => {
    // 22:00Z is already the next day in Tokyo (UTC+9).
    const instant = new Date('2026-01-15T22:00:00Z');

    expect(formatInTimezone(instant, 'UTC')).toContain('Jan 15, 2026');
    expect(formatInTimezone(instant, 'Asia/Tokyo')).toContain('Jan 16, 2026');
  });
});

describe('DST boundaries', () => {
  it('keeps the New York offset at -5 in winter and -4 in summer', () => {
    const winter = new Date('2026-01-15T12:00:00Z');
    const summer = new Date('2026-07-15T12:00:00Z');

    // Same wall-clock UTC instant, one hour apart in local time.
    expect(formatInTimezone(winter, 'America/New_York')).toContain('7:00 AM');
    expect(formatInTimezone(summer, 'America/New_York')).toContain('8:00 AM');
  });

  it('crosses the US spring-forward boundary without losing the day', () => {
    // 2026-03-08 is the US spring-forward date; 06:00Z is 01:00 EST, and by
    // 07:30Z the zone has jumped to 03:30 EDT.
    const beforeJump = new Date('2026-03-08T06:00:00Z');
    const afterJump = new Date('2026-03-08T07:30:00Z');

    expect(formatInTimezone(beforeJump, 'America/New_York')).toContain('1:00');
    expect(formatInTimezone(afterJump, 'America/New_York')).toContain('3:30');
  });

  it('handles the European transition, which happens on a different date', () => {
    // 2026-03-29 is the EU spring-forward date, one day after the US change.
    const beforeJump = new Date('2026-03-29T00:30:00Z');
    const afterJump = new Date('2026-03-29T01:30:00Z');

    // London is UTC+0 before the jump and UTC+1 after it.
    expect(formatInTimezone(beforeJump, 'Europe/London')).toContain('12:30');
    expect(formatInTimezone(afterJump, 'Europe/London')).toContain('2:30');
  });

  it('treats the southern-hemisphere zone as inverted relative to London', () => {
    // January is summer in Sydney, so the offset runs the other way round.
    const instant = new Date('2026-01-15T15:00:00Z');

    expect(formatInTimezone(instant, 'Europe/London')).toContain('3:00 PM');
    expect(formatInTimezone(instant, 'Australia/Sydney')).toContain('2:00 AM');
  });
});

describe('IsValidTimezone through class-validator', () => {
  class TimezoneDto {
    @IsValidTimezone()
    timezone!: string;
  }

  it('accepts a valid IANA zone', async () => {
    const dto = new TimezoneDto();
    dto.timezone = 'America/New_York';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a bogus zone', async () => {
    const dto = new TimezoneDto();
    dto.timezone = 'Not/AZone';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isValidTimezone).toBeDefined();
  });
});
