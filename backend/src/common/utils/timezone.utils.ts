/**
 * #996: Timezone utilities.
 *
 * Uses the built-in Intl.DateTimeFormat (ECMA-402) for IANA validation and
 * UTC ↔ user-timezone conversions so no extra runtime dependency is needed.
 */

/**
 * Return true when `tz` is a valid IANA timezone identifier recognised by
 * the runtime (e.g. 'America/New_York', 'UTC', 'Europe/London').
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a UTC Date to a localised ISO-8601 string in the given timezone.
 *
 * @param utcDate  - The date to convert (stored in UTC).
 * @param timezone - A valid IANA timezone string.
 * @returns        An ISO-8601 style string: "2024-03-10T14:30:00" in `timezone`.
 */
export function utcToTimezone(utcDate: Date, timezone: string): string {
  if (!isValidIanaTimezone(timezone)) {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }

  // Build a formatter that emits each part separately so we can reconstruct
  // an unambiguous ISO-like string without relying on locale-specific formats.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    fmt.formatToParts(utcDate).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * Convert a "wall-clock" time expressed in a given timezone back to UTC.
 *
 * @param localIso - ISO-8601 string without timezone suffix (e.g. "2024-03-10T14:30:00").
 * @param timezone - The IANA timezone the local time is expressed in.
 * @returns A UTC Date object.
 */
export function timezoneToUtc(localIso: string, timezone: string): Date {
  if (!isValidIanaTimezone(timezone)) {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }

  // JavaScript's Date constructor interprets strings without a Z/offset as
  // local (environment) time. We therefore use the Intl trick: format the
  // epoch origin in the target timezone and use the difference to compute
  // the UTC offset, then adjust.
  const naive = new Date(localIso + 'Z'); // treat as UTC temporarily
  if (isNaN(naive.getTime())) {
    throw new Error(`Invalid date string: ${localIso}`);
  }

  // Find out what UTC time corresponds to midnight on the same calendar date
  // in the target timezone and calculate the offset.
  const asLocal = utcToTimezone(naive, timezone);
  const diff = naive.getTime() - new Date(asLocal + 'Z').getTime();
  return new Date(naive.getTime() + diff);
}

/**
 * Format a Date as a UTC ISO string and append the user's timezone preference
 * so API consumers know how to display it.
 */
export function formatWithTimezone(
  utcDate: Date,
  userTimezone: string,
): { utc: string; local: string; timezone: string } {
  return {
    utc: utcDate.toISOString(),
    local: isValidIanaTimezone(userTimezone)
      ? utcToTimezone(utcDate, userTimezone)
      : utcDate.toISOString(),
    timezone: userTimezone,
  };
}
