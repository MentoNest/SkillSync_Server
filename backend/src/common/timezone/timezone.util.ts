import { BadRequestException } from '@nestjs/common';
import { DateTime, IANAZone } from 'luxon';

export const DEFAULT_TIMEZONE = 'UTC';

/** True when the string is a valid IANA timezone (e.g. 'America/New_York'). */
export function isValidTimezone(tz: unknown): tz is string {
  return typeof tz === 'string' && tz.length > 0 && IANAZone.isValidZone(tz);
}

/** Return `tz` when valid, otherwise `fallback`. */
export function normalizeTimezone(tz: string | null | undefined, fallback: string = DEFAULT_TIMEZONE): string {
  return isValidTimezone(tz) ? tz : fallback;
}

/** Convert an absolute instant (UTC) to a zoned {@link DateTime}. */
export function toZoned(date: Date | string, tz: string): DateTime {
  const zone = normalizeTimezone(tz);
  const dt =
    typeof date === 'string'
      ? DateTime.fromISO(date, { zone: DEFAULT_TIMEZONE })
      : DateTime.fromJSDate(date, { zone: DEFAULT_TIMEZONE });
  return dt.setZone(zone);
}

/** Interpret a wall-clock date/time in `tz` and return the UTC instant. */
export function convertToUtc(local: string | DateTime, tz: string): Date {
  const zone = normalizeTimezone(tz);
  const dt = typeof local === 'string' ? DateTime.fromISO(local, { zone }) : local.setZone(zone);
  if (!dt.isValid) throw new BadRequestException(`Invalid date/time: ${dt.invalidReason ?? 'unknown'}`);
  return dt.toUTC().toJSDate();
}

/** Format a UTC instant in `tz` as an ISO-8601 string (without milliseconds). */
export function fromUtc(date: Date | string, tz: string): string {
  const iso = toZoned(date, tz).toISO({ suppressMilliseconds: true });
  if (!iso) throw new BadRequestException('Invalid date');
  return iso;
}
