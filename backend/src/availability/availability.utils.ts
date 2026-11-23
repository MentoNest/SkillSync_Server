import { formatUtcInTimezone } from '../common/utils/timezone.utils';

export const TIME_HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export { isValidTimezone } from '../common/utils/timezone.utils';

export function parseTimeToMinutes(value: string): number {
  if (!TIME_HHMM_REGEX.test(value)) {
    throw new Error(`Invalid time format: ${value}`);
  }
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isEndAfterStart(start: string, end: string): boolean {
  return parseTimeToMinutes(end) > parseTimeToMinutes(start);
}

export function timeRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = parseTimeToMinutes(startA);
  const aEnd = parseTimeToMinutes(endA);
  const bStart = parseTimeToMinutes(startB);
  const bEnd = parseTimeToMinutes(endB);
  return aStart < bEnd && bStart < aEnd;
}

export function getUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getUtcTimeString(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

export function getUtcDayOfWeek(date: Date): number {
  return date.getUTCDay();
}

export function formatInTimezone(date: Date, timezone: string): string {
  return formatUtcInTimezone(date, timezone);
}

export function addDaysUtc(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

export function parseDateTime(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return date;
}
