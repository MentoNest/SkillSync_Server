/**
 * #1336: weekly availability slots - entity column contracts and validation.
 *
 * Two layers are covered, because the issue's guarantees are split across both:
 *
 * - the *schema* layer, asserted against TypeORM metadata, which is what keeps
 *   the composite indexes that make the overlap query fast;
 * - the *validation* layer, run through class-validator against the entity's own
 *   decorators, which is what actually stops a malformed slot reaching the
 *   database.
 *
 * Times are stored as `varchar(5)` in `HH:mm`, which is the reason the column
 * length and the time regex both matter: a `10:0` or `9:00` value would satisfy
 * a looser check and then break every render that assumes a fixed width.
 */
import { describe, expect, it } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AvailabilitySlot } from './availability-slot.entity.js';

/** Column options for a single property, or undefined when it is not a column. */
function columnOptions(property: string): Record<string, unknown> | undefined {
  const column = getMetadataArgsStorage().columns.find(
    (entry) =>
      entry.target === AvailabilitySlot && entry.propertyName === property,
  );
  return column?.options as Record<string, unknown> | undefined;
}

function columnMode(property: string): string | undefined {
  const column = getMetadataArgsStorage().columns.find(
    (entry) =>
      entry.target === AvailabilitySlot && entry.propertyName === property,
  );
  return column?.mode;
}

/** Build and validate a slot from a plain payload. */
async function validateSlot(payload: Record<string, unknown>) {
  const slot = plainToInstance(AvailabilitySlot, payload);
  const errors = await validate(slot);
  return {
    slot,
    errors,
    failed: errors.map((error) => error.property),
  };
}

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

describe('AvailabilitySlot table', () => {
  it('is mapped to availability_slots', () => {
    const tables = getMetadataArgsStorage().tables.filter(
      (table) => table.target === AvailabilitySlot,
    );

    expect(tables.map((table) => table.name)).toEqual(['availability_slots']);
  });

  it('indexes mentorId, the only way a mentor ever reads their own slots', () => {
    const indexes = getMetadataArgsStorage().indices.filter(
      (index) => index.target === AvailabilitySlot,
    );

    expect(
      indexes.some((index) => index.name === 'IDX_availability_slots_mentorId'),
    ).toBe(true);
  });

  it('indexes mentorId and dayOfWeek together for the per-day availability query', () => {
    const indexes = getMetadataArgsStorage().indices.filter(
      (index) => index.target === AvailabilitySlot,
    );
    const composite = indexes.find(
      (index) => index.name === 'IDX_availability_slots_mentorId_dayOfWeek',
    );

    expect(composite?.columns).toEqual(['mentorId', 'dayOfWeek']);
  });
});

describe('AvailabilitySlot columns', () => {
  it('uses a generated uuid primary key', () => {
    const id = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === AvailabilitySlot && column.propertyName === 'id',
    );

    expect(id?.options?.primary).toBe(true);
    expect(id?.options?.type).toBe('uuid');
  });

  it('stores dayOfWeek as a constrained int, not a string', () => {
    expect(columnOptions('dayOfWeek')?.type).toBe('int');
  });

  it('fixes both time columns at length 5 so HH:mm always pads to five characters', () => {
    expect(columnOptions('startTime')?.length).toBe(5);
    expect(columnOptions('endTime')?.length).toBe(5);
  });

  it('defaults the timezone to UTC', () => {
    expect(columnOptions('timezone')?.default).toBe('UTC');
  });

  it('generates createdAt on insert', () => {
    expect(columnMode('createdAt')).toBe('createDate');
  });
});

describe('AvailabilitySlot validation', () => {
  it('accepts a well-formed slot', async () => {
    const { errors } = await validateSlot({
      mentorId: VALID_UUID,
      dayOfWeek: 3,
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'America/New_York',
    });

    expect(errors).toHaveLength(0);
  });

  it('requires mentorId to be a uuid', async () => {
    const { failed } = await validateSlot({
      mentorId: 'not-a-uuid',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
    });

    expect(failed).toContain('mentorId');
  });

  it.each([0, 1, 2, 3, 4, 5, 6])('accepts dayOfWeek %i', async (dayOfWeek) => {
    const { errors } = await validateSlot({
      mentorId: VALID_UUID,
      dayOfWeek,
      startTime: '09:00',
      endTime: '10:00',
      timezone: 'UTC',
    });

    expect(errors).toHaveLength(0);
  });

  it.each([-1, 7, 1.5])(
    'rejects out-of-range dayOfWeek %s',
    async (dayOfWeek) => {
      const { failed } = await validateSlot({
        mentorId: VALID_UUID,
        dayOfWeek,
        startTime: '09:00',
        endTime: '10:00',
      });

      expect(failed).toContain('dayOfWeek');
    },
  );

  it.each(['09:00', '00:00', '23:59', '10:30'])(
    'accepts the time %s',
    async (startTime) => {
      const { errors } = await validateSlot({
        mentorId: VALID_UUID,
        dayOfWeek: 1,
        startTime,
        endTime: '23:58',
        timezone: 'UTC',
      });

      expect(errors).toHaveLength(0);
    },
  );

  it.each(['9:00', '24:00', '09:60', '9am', '0900', '09-00'])(
    'rejects the malformed time %s',
    async (startTime) => {
      const { failed } = await validateSlot({
        mentorId: VALID_UUID,
        dayOfWeek: 1,
        startTime,
        endTime: '10:00',
      });

      expect(failed).toContain('startTime');
    },
  );

  it('rejects a malformed endTime too, not just the start', async () => {
    const { failed } = await validateSlot({
      mentorId: VALID_UUID,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '25:00',
    });

    expect(failed).toContain('endTime');
  });

  it('rejects a non-string time', async () => {
    const { failed } = await validateSlot({
      mentorId: VALID_UUID,
      dayOfWeek: 1,
      startTime: 900,
      endTime: '10:00',
    });

    expect(failed).toContain('startTime');
  });

  it('rejects a slot with no timezone, even though the column defaults to UTC', async () => {
    // The column carries a DB-level default of 'UTC', but @IsString() on
    // `timezone` is not paired with @IsOptional(), so a payload that omits the
    // field is rejected at the validation layer. Pinned here because it is a
    // genuine divergence between the schema default and the DTO rules, and a
    // caller relying on the default would otherwise be surprised.
    const { failed } = await validateSlot({
      mentorId: VALID_UUID,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
    });

    expect(failed).toContain('timezone');
  });

  it('does not reject a slot that is stored in a non-UTC timezone', async () => {
    const { slot, errors } = await validateSlot({
      mentorId: VALID_UUID,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      timezone: 'Asia/Tokyo',
    });

    expect(errors).toHaveLength(0);
    expect(slot.timezone).toBe('Asia/Tokyo');
  });
});

describe('AvailabilitySlot instances', () => {
  it('round-trips a full weekly schedule', () => {
    const slots = [1, 3, 5].map((dayOfWeek) => {
      const slot = new AvailabilitySlot();
      Object.assign(slot, {
        id: `0000000${dayOfWeek}-0000-4000-8000-000000000000`,
        mentorId: VALID_UUID,
        dayOfWeek,
        startTime: '09:00',
        endTime: '12:00',
        timezone: 'Europe/London',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      return slot;
    });

    expect(slots.map((slot) => slot.dayOfWeek)).toEqual([1, 3, 5]);
    expect(new Set(slots.map((slot) => slot.startTime)).size).toBe(1);
  });

  it('can hold two separate windows on the same day', () => {
    const morning = new AvailabilitySlot();
    morning.dayOfWeek = 2;
    morning.startTime = '09:00';
    morning.endTime = '12:00';

    const afternoon = new AvailabilitySlot();
    afternoon.dayOfWeek = 2;
    afternoon.startTime = '14:00';
    afternoon.endTime = '18:00';

    // The entity holds one window per row; the split windows are two rows for
    // the same mentor and day, which the composite index is there to serve.
    expect(morning.dayOfWeek).toBe(afternoon.dayOfWeek);
    expect(morning.endTime).not.toBe(afternoon.startTime);
  });
});
