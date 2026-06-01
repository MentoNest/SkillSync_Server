// IANA timezone list subset for validation
const IANA_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

export function isValidTimezone(tz: string): boolean {
  return IANA_TIMEZONES.has(tz);
}

export function toUtc(date: Date, _fromTimezone: string): Date {
  // Dates are already stored in UTC; this is a no-op helper for clarity
  return new Date(date.toISOString());
}

export function fromUtc(date: Date, toTimezone: string): string {
  return date.toLocaleString('en-US', { timeZone: toTimezone, timeZoneName: 'short' });
}

export function nowInTimezone(tz: string): string {
  return new Date().toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' });
}
