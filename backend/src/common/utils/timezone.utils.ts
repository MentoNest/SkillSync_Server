import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import moment from 'moment-timezone';

export function isValidTimezone(timezone: string): boolean {
  return moment.tz.zone(timezone) !== null;
}

export function resolveTimezone(
  preferredTimezone: string | null | undefined,
  override?: string,
): string {
  if (override === undefined) {
    const preferred = preferredTimezone ?? 'UTC';
    if (!isValidTimezone(preferred)) {
      throw new InternalServerErrorException(
        'Stored user timezone is not a valid IANA timezone.',
      );
    }
    return preferred;
  }

  const timezone = override.trim();
  if (!isValidTimezone(timezone)) {
    throw new BadRequestException(
      'Accept-Timezone must be a valid IANA timezone.',
    );
  }
  return timezone;
}

export function convertUtcToTimezone(
  value: Date | string,
  timezone: string,
): string {
  if (!isValidTimezone(timezone)) {
    throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  }

  const converted = moment.utc(value).tz(timezone);
  if (!converted.isValid()) {
    throw new RangeError(`Invalid UTC datetime: ${String(value)}`);
  }
  return converted.format('YYYY-MM-DDTHH:mm:ss.SSSZ');
}

export function formatUtcInTimezone(
  value: Date | string,
  timezone: string,
): string {
  if (!isValidTimezone(timezone)) {
    throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  }

  const converted = moment.utc(value).tz(timezone);
  if (!converted.isValid()) {
    throw new RangeError(`Invalid UTC datetime: ${String(value)}`);
  }
  return converted.format('YYYY-MM-DD, HH:mm z');
}
