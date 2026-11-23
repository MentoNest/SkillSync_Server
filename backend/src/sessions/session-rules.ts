export enum SessionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export enum SessionRole {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

export const ACTIVE_STATUSES: readonly SessionStatus[] = [
  SessionStatus.PENDING,
  SessionStatus.CONFIRMED,
];

const TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  [SessionStatus.PENDING]: [SessionStatus.CONFIRMED, SessionStatus.CANCELLED],
  [SessionStatus.CONFIRMED]: [
    SessionStatus.COMPLETED,
    SessionStatus.CANCELLED,
    SessionStatus.NO_SHOW,
  ],
  [SessionStatus.COMPLETED]: [],
  [SessionStatus.CANCELLED]: [],
  [SessionStatus.NO_SHOW]: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TimeRange {
  startTime: Date;
  endTime: Date;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

export function findConflict<T extends TimeRange>(
  existing: readonly T[],
  candidate: TimeRange,
): T | undefined {
  return existing.find((session) => rangesOverlap(session, candidate));
}

export const CANCELLATION_NOTICE_HOURS = 24;
export const MAX_SESSION_HOURS = 4;
export const MIN_RATING = 1;
export const MAX_RATING = 5;

export function hasCancellationNotice(
  startTime: Date,
  now: Date = new Date(),
  noticeHours: number = CANCELLATION_NOTICE_HOURS,
): boolean {
  return startTime.getTime() - now.getTime() >= noticeHours * 3_600_000;
}

export function validateSessionWindow(
  start: Date,
  end: Date,
  now: Date = new Date(),
): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Invalid start or end time';
  }
  if (end <= start) return 'endTime must be after startTime';
  if (start <= now) return 'Sessions must start in the future';
  if (end.getTime() - start.getTime() > MAX_SESSION_HOURS * 3_600_000) {
    return `Sessions cannot be longer than ${MAX_SESSION_HOURS} hours`;
  }
  return null;
}
