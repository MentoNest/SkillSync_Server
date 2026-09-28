/**
 * Fix #1170: lightweight IANA timezone helpers using the built-in
 * Intl API (no new dependency) rather than moment-timezone/luxon.
 */

/** Validates that `timezone` is a recognized IANA zone name. */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Formats a UTC Date as a localized string in the given IANA timezone. */
export function formatInTimezone(date: Date, timezone: string): string {
  const zone = isValidTimezone(timezone) ? timezone : 'UTC';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export const DEFAULT_TIMEZONE = 'UTC';
