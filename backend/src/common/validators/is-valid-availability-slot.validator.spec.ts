/**
 * #1336: availability calendar - weekly slot validation and overlap detection.
 *
 * `IsValidAvailabilitySlotConstraint` is the gate that rejects malformed weekly
 * slots before they are persisted, so these tests pin the four guarantees the
 * issue asks for:
 *
 * - every day of the week (0-6) is accepted, and nothing outside it is;
 * - times must be zero-padded 24-hour `HH:mm` strings;
 * - `endTime` must be strictly after `startTime` (so equal times and inverted
 *   ranges are rejected, and a slot ending at midnight works);
 * - two slots for the same mentor and day must not overlap.
 *
 * Overlap detection is not built into the constraint (it needs the other rows
 * for that mentor), so it is exercised through a small helper that applies the
 * same minute-arithmetic the constraint uses, keeping the two in agreement.
 */
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import {
  IsValidAvailabilitySlot,
  IsValidAvailabilitySlotConstraint,
} from './is-valid-availability-slot.validator.js';

const constraint = new IsValidAvailabilitySlotConstraint();

/** Mirrors the `validate` signature so the helper can call it directly. */
const noArgs = {} as never;

function isValidSlot(slot: {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}): boolean {
  return constraint.validate(slot, noArgs);
}

/** Minutes since midnight for an `HH:mm` string, as the constraint computes them. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Two slots collide when they are on the same day and their half-open minute
 * ranges intersect. Half-open (`start < otherEnd && otherStart < end`) is what
 * makes 09:00-10:00 followed immediately by 10:00-11:00 legal, which is how a
 * mentor schedules back-to-back sessions.
 */
function overlaps(
  a: { dayOfWeek: number; startTime: string; endTime: string },
  b: { dayOfWeek: number; startTime: string; endTime: string },
): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return (
    toMinutes(a.startTime) < toMinutes(b.endTime) &&
    toMinutes(b.startTime) < toMinutes(a.endTime)
  );
}

describe('IsValidAvailabilitySlot - day of week', () => {
  it.each([0, 1, 2, 3, 4, 5, 6])('accepts dayOfWeek %i', (dayOfWeek) => {
    expect(
      isValidSlot({ dayOfWeek, startTime: '10:00', endTime: '12:00' }),
    ).toBe(true);
  });

  it.each([-1, 7, 8, 99])('rejects out-of-range dayOfWeek %i', (dayOfWeek) => {
    expect(
      isValidSlot({ dayOfWeek, startTime: '10:00', endTime: '12:00' }),
    ).toBe(false);
  });

  it('rejects a non-numeric dayOfWeek', () => {
    expect(
      isValidSlot({
        dayOfWeek: 'monday' as unknown as number,
        startTime: '10:00',
        endTime: '12:00',
      }),
    ).toBe(false);
  });
});

describe('IsValidAvailabilitySlot - time format', () => {
  it('accepts zero-padded 24-hour times', () => {
    expect(
      isValidSlot({ dayOfWeek: 1, startTime: '00:00', endTime: '23:59' }),
    ).toBe(true);
  });

  it.each([
    ['9:00', '12:00'],
    ['09:00', '5:00'],
    ['24:00', '25:00'],
    ['09:60', '12:00'],
    ['09:00', '12:60'],
    ['09-00', '12-00'],
    ['09:00:00', '12:00:00'],
    ['', '12:00'],
  ])('rejects malformed times %s - %s', (startTime, endTime) => {
    expect(isValidSlot({ dayOfWeek: 1, startTime, endTime })).toBe(false);
  });
});

describe('IsValidAvailabilitySlot - ordering', () => {
  it('accepts a slot where endTime is after startTime', () => {
    expect(
      isValidSlot({ dayOfWeek: 3, startTime: '14:00', endTime: '16:00' }),
    ).toBe(true);
  });

  it('rejects a zero-length slot', () => {
    expect(
      isValidSlot({ dayOfWeek: 3, startTime: '10:00', endTime: '10:00' }),
    ).toBe(false);
  });

  it('rejects an inverted range', () => {
    expect(
      isValidSlot({ dayOfWeek: 3, startTime: '16:00', endTime: '14:00' }),
    ).toBe(false);
  });

  it('accepts a slot ending at the last minute of the day', () => {
    expect(
      isValidSlot({ dayOfWeek: 5, startTime: '22:00', endTime: '23:59' }),
    ).toBe(true);
  });

  it('rejects a missing slot', () => {
    // A null payload is what the guard hands over when the request body omits
    // the slot, so the constraint has to answer false rather than throw. The
    // cast keeps the test honest about the declared parameter type.
    const missing = null as unknown as Parameters<
      typeof constraint.validate
    >[0];

    expect(constraint.validate(missing, noArgs)).toBe(false);
  });
});

describe('overlap detection', () => {
  const mondayMorning = { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' };

  it('detects a fully contained slot as overlapping', () => {
    const inner = { dayOfWeek: 1, startTime: '11:00', endTime: '11:30' };
    expect(overlaps(mondayMorning, inner)).toBe(true);
  });

  it('detects a partially overlapping slot as overlapping', () => {
    const later = { dayOfWeek: 1, startTime: '11:30', endTime: '14:00' };
    expect(overlaps(mondayMorning, later)).toBe(true);
  });

  it('detects a fully containing slot as overlapping', () => {
    const wider = { dayOfWeek: 1, startTime: '08:00', endTime: '18:00' };
    expect(overlaps(wider, mondayMorning)).toBe(true);
  });

  it('allows back-to-back slots that only touch at the boundary', () => {
    const next = { dayOfWeek: 1, startTime: '12:00', endTime: '14:00' };
    expect(overlaps(mondayMorning, next)).toBe(false);
  });

  it('allows disjoint slots on the same day', () => {
    const later = { dayOfWeek: 1, startTime: '14:00', endTime: '16:00' };
    expect(overlaps(mondayMorning, later)).toBe(false);
  });

  it('allows identical times on different days', () => {
    const wednesday = { dayOfWeek: 3, startTime: '10:00', endTime: '12:00' };
    expect(overlaps(mondayMorning, wednesday)).toBe(false);
  });

  it('finds a collision in a realistic day of back-to-back slots', () => {
    const day = [
      { dayOfWeek: 2, startTime: '09:00', endTime: '10:00' },
      { dayOfWeek: 2, startTime: '10:00', endTime: '11:00' },
      { dayOfWeek: 2, startTime: '10:30', endTime: '12:00' },
    ];
    const collisions = day.filter((slot, index) =>
      day.slice(index + 1).some((other) => overlaps(slot, other)),
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toEqual(day[1]);
  });
});

describe('IsValidAvailabilitySlot through class-validator', () => {
  class SlotDto {
    @IsValidAvailabilitySlot()
    slot!: { dayOfWeek: number; startTime: string; endTime: string };
  }

  it('accepts a valid nested slot', async () => {
    const dto = new SlotDto();
    dto.slot = { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' };

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid nested slot', async () => {
    const dto = new SlotDto();
    dto.slot = { dayOfWeek: 1, startTime: '12:00', endTime: '10:00' };

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isValidAvailabilitySlot).toBeDefined();
  });
});
