// IANA timezone strings — a representative subset used for validation.
const IANA_TIMEZONES = new Set([
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
]);

/**
 * Returns true when the supplied string is a recognised IANA timezone identifier.
 * Falls back to Intl.supportedValuesOf when available (Node 18+).
 */
export function isValidTimezone(tz: string): boolean {
  if (typeof (Intl as any).supportedValuesOf === 'function') {
    try {
      return (Intl as any).supportedValuesOf('timeZone').includes(tz);
    } catch {
      // fall through
    }
  }
  return IANA_TIMEZONES.has(tz);
}

/**
 * Converts a UTC Date to a formatted ISO-8601 string in the given IANA timezone.
 * Returns the UTC string unchanged if the timezone is invalid.
 */
export function toUserTimezone(utcDate: Date, timezone: string): string {
  if (!isValidTimezone(timezone)) {
    return utcDate.toISOString();
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(utcDate);
}

/**
 * Extracts the user's preferred timezone from an Accept-Timezone header value,
 * falling back to 'UTC' if the header is absent or invalid.
 */
export function resolveTimezone(
  preferredTimezone?: string,
  headerTimezone?: string,
): string {
  const tz = headerTimezone ?? preferredTimezone ?? 'UTC';
  return isValidTimezone(tz) ? tz : 'UTC';
}
