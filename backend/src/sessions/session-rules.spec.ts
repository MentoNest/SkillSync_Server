import {
  SessionStatus,
  canTransition,
  findConflict,
  hasCancellationNotice,
  rangesOverlap,
  validateSessionWindow,
} from './session-rules';

const at = (iso: string) => new Date(iso);
const range = (a: string, b: string) => ({ startTime: at(a), endTime: at(b) });

describe('booking conflict detection', () => {
  const existing = [range('2030-01-01T10:00:00Z', '2030-01-01T11:00:00Z')];

  it('detects overlapping sessions', () => {
    expect(rangesOverlap(existing[0], range('2030-01-01T10:30:00Z', '2030-01-01T11:30:00Z'))).toBe(true);
    expect(findConflict(existing, range('2030-01-01T09:00:00Z', '2030-01-01T10:01:00Z'))).toBe(existing[0]);
  });

  it('detects a session fully containing or contained', () => {
    expect(rangesOverlap(existing[0], range('2030-01-01T09:00:00Z', '2030-01-01T12:00:00Z'))).toBe(true);
    expect(rangesOverlap(existing[0], range('2030-01-01T10:15:00Z', '2030-01-01T10:45:00Z'))).toBe(true);
  });

  it('allows back-to-back sessions', () => {
    expect(findConflict(existing, range('2030-01-01T11:00:00Z', '2030-01-01T12:00:00Z'))).toBeUndefined();
    expect(findConflict(existing, range('2030-01-01T09:00:00Z', '2030-01-01T10:00:00Z'))).toBeUndefined();
  });
});

describe('status workflow', () => {
  it('follows pending -> confirmed -> completed/cancelled', () => {
    expect(canTransition(SessionStatus.PENDING, SessionStatus.CONFIRMED)).toBe(true);
    expect(canTransition(SessionStatus.CONFIRMED, SessionStatus.COMPLETED)).toBe(true);
    expect(canTransition(SessionStatus.CONFIRMED, SessionStatus.NO_SHOW)).toBe(true);
    expect(canTransition(SessionStatus.PENDING, SessionStatus.CANCELLED)).toBe(true);
  });

  it('rejects skipping steps and leaving a final status', () => {
    expect(canTransition(SessionStatus.PENDING, SessionStatus.COMPLETED)).toBe(false);
    expect(canTransition(SessionStatus.COMPLETED, SessionStatus.CANCELLED)).toBe(false);
    expect(canTransition(SessionStatus.CANCELLED, SessionStatus.CONFIRMED)).toBe(false);
  });
});

describe('cancellation policy', () => {
  const now = at('2030-01-01T00:00:00Z');

  it('requires 24 hours notice', () => {
    expect(hasCancellationNotice(at('2030-01-02T00:00:00Z'), now)).toBe(true);
    expect(hasCancellationNotice(at('2030-01-01T23:59:00Z'), now)).toBe(false);
  });
});

describe('session window validation', () => {
  const now = at('2030-01-01T00:00:00Z');

  it('accepts a valid future window', () => {
    expect(validateSessionWindow(at('2030-01-02T10:00:00Z'), at('2030-01-02T11:00:00Z'), now)).toBeNull();
  });

  it('rejects reversed, past and overlong windows', () => {
    expect(validateSessionWindow(at('2030-01-02T11:00:00Z'), at('2030-01-02T10:00:00Z'), now)).toMatch(/after/);
    expect(validateSessionWindow(at('2029-12-31T10:00:00Z'), at('2029-12-31T11:00:00Z'), now)).toMatch(/future/);
    expect(validateSessionWindow(at('2030-01-02T10:00:00Z'), at('2030-01-02T15:00:00Z'), now)).toMatch(/longer/);
  });
});
