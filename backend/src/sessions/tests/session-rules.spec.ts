import {
  SessionStatus,
  canTransition,
  findConflict,
  hasCancellationNotice,
  rangesOverlap,
  validateSessionWindow,
} from '../session-rules';

const at = (iso: string) => new Date(iso);
const range = (start: string, end: string) => ({
  startTime: at(start),
  endTime: at(end),
});

describe('session rules', () => {
  describe('conflict detection', () => {
    const existing = range('2030-01-02T10:00:00Z', '2030-01-02T11:00:00Z');

    it('detects partial, containing and contained overlaps', () => {
      expect(
        rangesOverlap(
          existing,
          range('2030-01-02T10:30:00Z', '2030-01-02T11:30:00Z'),
        ),
      ).toBe(true);
      expect(
        rangesOverlap(
          existing,
          range('2030-01-02T09:00:00Z', '2030-01-02T12:00:00Z'),
        ),
      ).toBe(true);
      expect(
        rangesOverlap(
          existing,
          range('2030-01-02T10:15:00Z', '2030-01-02T10:45:00Z'),
        ),
      ).toBe(true);
      expect(
        findConflict(
          [existing],
          range('2030-01-02T10:59:00Z', '2030-01-02T11:30:00Z'),
        ),
      ).toBe(existing);
    });

    it('allows back-to-back sessions', () => {
      expect(
        findConflict(
          [existing],
          range('2030-01-02T11:00:00Z', '2030-01-02T12:00:00Z'),
        ),
      ).toBeUndefined();
      expect(
        findConflict(
          [existing],
          range('2030-01-02T09:00:00Z', '2030-01-02T10:00:00Z'),
        ),
      ).toBeUndefined();
    });
  });

  describe('status workflow', () => {
    it('follows pending to confirmed to completed, cancelled or no_show', () => {
      expect(
        canTransition(SessionStatus.PENDING, SessionStatus.CONFIRMED),
      ).toBe(true);
      expect(
        canTransition(SessionStatus.PENDING, SessionStatus.CANCELLED),
      ).toBe(true);
      expect(
        canTransition(SessionStatus.CONFIRMED, SessionStatus.COMPLETED),
      ).toBe(true);
      expect(
        canTransition(SessionStatus.CONFIRMED, SessionStatus.CANCELLED),
      ).toBe(true);
      expect(
        canTransition(SessionStatus.CONFIRMED, SessionStatus.NO_SHOW),
      ).toBe(true);
    });

    it('rejects skipped steps and transitions out of final states', () => {
      expect(
        canTransition(SessionStatus.PENDING, SessionStatus.COMPLETED),
      ).toBe(false);
      expect(canTransition(SessionStatus.PENDING, SessionStatus.NO_SHOW)).toBe(
        false,
      );
      expect(
        canTransition(SessionStatus.COMPLETED, SessionStatus.CANCELLED),
      ).toBe(false);
      expect(
        canTransition(SessionStatus.CANCELLED, SessionStatus.CONFIRMED),
      ).toBe(false);
      expect(
        canTransition(SessionStatus.NO_SHOW, SessionStatus.COMPLETED),
      ).toBe(false);
    });
  });

  describe('cancellation policy', () => {
    const now = at('2030-01-01T00:00:00Z');

    it('requires at least 24 hours notice', () => {
      expect(hasCancellationNotice(at('2030-01-02T00:00:00Z'), now)).toBe(true);
      expect(hasCancellationNotice(at('2030-01-01T23:59:59Z'), now)).toBe(
        false,
      );
    });
  });

  describe('window validation', () => {
    const now = at('2030-01-01T00:00:00Z');

    it('accepts a valid future window', () => {
      expect(
        validateSessionWindow(
          at('2030-01-02T10:00:00Z'),
          at('2030-01-02T11:00:00Z'),
          now,
        ),
      ).toBeNull();
    });

    it('rejects invalid, reversed, past and overlong windows', () => {
      expect(
        validateSessionWindow(at('invalid'), at('2030-01-02T11:00:00Z'), now),
      ).toMatch(/Invalid/);
      expect(
        validateSessionWindow(
          at('2030-01-02T11:00:00Z'),
          at('2030-01-02T10:00:00Z'),
          now,
        ),
      ).toMatch(/after/);
      expect(
        validateSessionWindow(
          at('2029-12-31T10:00:00Z'),
          at('2029-12-31T11:00:00Z'),
          now,
        ),
      ).toMatch(/future/);
      expect(
        validateSessionWindow(
          at('2030-01-02T10:00:00Z'),
          at('2030-01-02T15:00:00Z'),
          now,
        ),
      ).toMatch(/longer/);
    });
  });
});
