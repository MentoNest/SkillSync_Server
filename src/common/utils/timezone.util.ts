/**
 * Timezone utility helpers for converting and formatting dates across IANA timezones.
 *
 * All datetime values are stored in the database as UTC. These helpers handle:
 * - Validating IANA timezone strings
 * - Converting local datetimes (with a known timezone) → UTC for storage
 * - Converting UTC datetimes → local timezone ISO strings for display
 * - Formatting UTC dates for human-readable output in a user's timezone
 */
export class TimezoneUtil {
  /**
   * Validates an IANA timezone identifier string (e.g. "America/New_York", "Europe/London").
   */
  static isValidTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns the UTC offset in milliseconds for a timezone at a specific moment.
   * Positive = east of UTC (e.g. UTC+5:30 → +19800000 ms).
   *
   * Uses formatToParts to avoid locale-specific string parsing issues.
   */
  private static getTimezoneOffsetMs(date: Date, timezone: string): number {
    const toParts = (tz: string): Intl.DateTimeFormatPart[] =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(date);

    const partsToMs = (parts: Intl.DateTimeFormatPart[]): number => {
      const get = (type: string) =>
        parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
      // Intl may return 24 for midnight in hour12:false mode; normalise to 0
      const hour = get('hour') === 24 ? 0 : get('hour');
      return Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
    };

    return partsToMs(toParts(timezone)) - partsToMs(toParts('UTC'));
  }

  /**
   * Converts a local datetime string (without timezone info) expressed in the
   * given IANA timezone to a UTC Date object.
   *
   * @param localDateStr - ISO 8601 datetime without offset, e.g. "2024-03-15T14:30:00"
   * @param timezone     - IANA timezone, e.g. "America/New_York"
   * @returns            Equivalent UTC Date
   *
   * @example
   *   // 14:30 in New York (UTC-5) → 19:30 UTC
   *   TimezoneUtil.toUTC('2024-03-15T14:30:00', 'America/New_York')
   *   // → Date representing 2024-03-15T19:30:00.000Z
   */
  static toUTC(localDateStr: string, timezone: string): Date {
    // Strip any trailing Z so we don't accidentally treat the input as UTC
    const normalized = localDateStr.replace(/Z$/, '');
    // Temporarily treat the local string as UTC to get a base Date
    const tempDate = new Date(`${normalized}Z`);
    // Compute the timezone offset at this approximate moment and subtract it
    const offsetMs = TimezoneUtil.getTimezoneOffsetMs(tempDate, timezone);
    return new Date(tempDate.getTime() - offsetMs);
  }

  /**
   * Formats a UTC Date as a local ISO-like string ("YYYY-MM-DDTHH:mm:ss")
   * in the given IANA timezone — without any offset suffix.
   *
   * @example
   *   TimezoneUtil.toLocalISOString(new Date('2024-03-15T19:30:00Z'), 'America/New_York')
   *   // → "2024-03-15T14:30:00"
   */
  static toLocalISOString(utcDate: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(utcDate);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
  }

  /**
   * Formats a UTC Date for human-readable display in the user's timezone.
   *
   * @param utcDate  - The UTC date to format
   * @param timezone - IANA timezone identifier
   * @param options  - Intl.DateTimeFormatOptions overrides (merged with defaults)
   * @param locale   - BCP 47 locale tag (default "en-US")
   *
   * @example
   *   TimezoneUtil.formatInTimezone(new Date('2024-03-15T19:30:00Z'), 'America/New_York')
   *   // → "March 15, 2024 at 02:30 PM"
   */
  static formatInTimezone(
    utcDate: Date,
    timezone: string,
    options: Intl.DateTimeFormatOptions = {},
    locale = 'en-US',
  ): string {
    const defaults: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    };
    return new Intl.DateTimeFormat(locale, { ...defaults, ...options, timeZone: timezone }).format(
      utcDate,
    );
  }

  /**
   * Returns a human-readable UTC offset string for a timezone at a given moment.
   *
   * @example
   *   TimezoneUtil.getUTCOffsetString('America/New_York') // → "UTC-05:00"
   *   TimezoneUtil.getUTCOffsetString('Asia/Kolkata')     // → "UTC+05:30"
   */
  static getUTCOffsetString(timezone: string, date = new Date()): string {
    const offsetMs = TimezoneUtil.getTimezoneOffsetMs(date, timezone);
    const sign = offsetMs >= 0 ? '+' : '-';
    const absMs = Math.abs(offsetMs);
    const hours = String(Math.floor(absMs / 3_600_000)).padStart(2, '0');
    const minutes = String(Math.floor((absMs % 3_600_000) / 60_000)).padStart(2, '0');
    return `UTC${sign}${hours}:${minutes}`;
  }
}
