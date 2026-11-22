import {
  BusinessRuleException,
  ResourceNotFoundException,
} from '../../common/errors/app-exceptions';
import { AvailabilityException } from '../availability-exception.entity';
import { AvailabilitySlot } from '../availability-slot.entity';
import { AvailabilityService } from '../availability.service';

const MENTOR = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

function slot(overrides: Partial<AvailabilitySlot> = {}): AvailabilitySlot {
  return Object.assign(new AvailabilitySlot(), {
    id: 'slot-1',
    mentorId: MENTOR,
    dayOfWeek: 1,
    startTimeUtc: '10:00',
    endTimeUtc: '12:00',
    timezone: 'UTC',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

function exception(overrides: Partial<AvailabilityException> = {}): AvailabilityException {
  return Object.assign(new AvailabilityException(), {
    id: 'exc-1',
    mentorId: MENTOR,
    date: '2026-11-23',
    startTimeUtc: '11:00',
    endTimeUtc: '12:00',
    reason: 'Team offsite',
    isUnavailable: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

/** Reads TypeORM's `Not(value)` operator without importing its internal shape. */
function excludedId(value: unknown): string | undefined {
  if (value && typeof value === 'object') {
    const operator = value as { _value?: string; value?: string };
    return operator._value ?? operator.value;
  }
  return undefined;
}

function makeService(opts: {
  slots?: AvailabilitySlot[];
  exceptions?: AvailabilityException[];
} = {}) {
  const slots = opts.slots ?? [];
  const exceptions = opts.exceptions ?? [];

  const slotRepo = {
    find: jest.fn(async ({ where }: any) => {
      return slots.filter((candidate) => {
        if (where?.mentorId && candidate.mentorId !== where.mentorId) return false;
        if (where?.dayOfWeek !== undefined && candidate.dayOfWeek !== where.dayOfWeek) return false;
        if (where?.id !== undefined) {
          const excluded = excludedId(where.id);
          if (excluded !== undefined ? candidate.id === excluded : candidate.id !== where.id) {
            return false;
          }
        }
        return true;
      });
    }),
    findOne: jest.fn(async ({ where }: any) => {
      return slots.find((candidate) => candidate.id === where.id && candidate.mentorId === where.mentorId) ?? null;
    }),
    create: jest.fn((data: any) => Object.assign(new AvailabilitySlot(), { id: 'new-slot', ...data })),
    save: jest.fn(async (entity: AvailabilitySlot) => entity),
    remove: jest.fn(async (entity: AvailabilitySlot) => {
      const index = slots.indexOf(entity);
      if (index >= 0) slots.splice(index, 1);
      return entity;
    }),
  };

  const exceptionRepo = {
    find: jest.fn(async ({ where }: any) => {
      return exceptions.filter((candidate) => {
        if (where?.mentorId && candidate.mentorId !== where.mentorId) return false;
        if (where?.date && candidate.date !== where.date) return false;
        if (where?.id !== undefined) {
          const excluded = excludedId(where.id);
          if (excluded !== undefined ? candidate.id === excluded : candidate.id !== where.id) {
            return false;
          }
        }
        return true;
      });
    }),
    findOne: jest.fn(async ({ where }: any) => {
      return exceptions.find((candidate) => candidate.id === where.id && candidate.mentorId === where.mentorId) ?? null;
    }),
    create: jest.fn((data: any) => Object.assign(new AvailabilityException(), { id: 'new-exc', ...data })),
    save: jest.fn(async (entity: AvailabilityException) => entity),
    remove: jest.fn(async (entity: AvailabilityException) => {
      const index = exceptions.indexOf(entity);
      if (index >= 0) exceptions.splice(index, 1);
      return entity;
    }),
  };

  const mentorRepo = { existsBy: jest.fn(async () => true) };
  const service = new AvailabilityService(slotRepo as never, exceptionRepo as never, mentorRepo as never);
  return { service, slotRepo, exceptionRepo, mentorRepo };
}

describe('AvailabilityService business rules', () => {
  it('updates a slot while ignoring its own id in the overlap check', async () => {
    const existing = slot();
    const { service, slotRepo } = makeService({ slots: [existing] });

    const updated = await service.updateSlot(MENTOR, existing.id, {
      startTimeUtc: '09:00',
      endTimeUtc: '11:00',
    });

    expect(updated).toMatchObject({ startTimeUtc: '09:00', endTimeUtc: '11:00', dayOfWeek: 1 });
    expect(slotRepo.save).toHaveBeenCalledWith(existing);
  });

  it('rejects an update that overlaps another slot and missing slots', async () => {
    const first = slot();
    const second = slot({ id: 'slot-2', startTimeUtc: '12:00', endTimeUtc: '14:00' });
    const { service } = makeService({ slots: [first, second] });

    await expect(
      service.updateSlot(MENTOR, first.id, { endTimeUtc: '13:00' }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
    await expect(service.updateSlot(MENTOR, 'missing', { endTimeUtc: '13:00' })).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('deletes only slots owned by the mentor', async () => {
    const { service, slotRepo } = makeService({ slots: [slot()] });

    await service.deleteSlot(MENTOR, 'slot-1');

    expect(slotRepo.remove).toHaveBeenCalledTimes(1);
    await expect(service.deleteSlot(MENTOR, 'slot-1')).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('defaults exceptions to unavailable and rejects invalid or overlapping windows', async () => {
    const { service, exceptionRepo } = makeService({ exceptions: [exception()] });

    const created = await service.createException(MENTOR, {
      date: '2026-11-24',
      startTimeUtc: '10:00',
      endTimeUtc: '11:00',
    });

    expect(created.isUnavailable).toBe(true);
    await expect(
      service.createException(MENTOR, {
        date: '2026-11-24',
        startTimeUtc: '12:00',
        endTimeUtc: '12:00',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
    await expect(
      service.createException(MENTOR, {
        date: '2026-11-23',
        startTimeUtc: '11:30',
        endTimeUtc: '12:30',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
    expect(exceptionRepo.save).toHaveBeenCalledTimes(1);
  });

  it('updates exceptions without treating the same row as a conflict', async () => {
    const existing = exception();
    const { service } = makeService({ exceptions: [existing] });

    const updated = await service.updateException(MENTOR, existing.id, {
      startTimeUtc: '10:30',
      isUnavailable: false,
    });

    expect(updated).toMatchObject({ startTimeUtc: '10:30', isUnavailable: false });
    await expect(service.deleteException(MENTOR, 'missing')).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('treats the slot end as exclusive and ignores available exceptions', async () => {
    const { service } = makeService({
      slots: [slot()],
      exceptions: [
        exception({ isUnavailable: false, startTimeUtc: '10:00', endTimeUtc: '12:00' }),
      ],
    });

    await expect(service.isAvailable(MENTOR, '2026-11-23T10:00:00.000Z')).resolves.toMatchObject({
      available: true,
    });
    await expect(service.isAvailable(MENTOR, '2026-11-23T12:00:00.000Z')).resolves.toMatchObject({
      available: false,
    });
  });

  it('splits a 30-day window around a mid-slot exception and formats local time', async () => {
    const { service } = makeService({
      slots: [slot({ endTimeUtc: '14:00', timezone: 'America/New_York' })],
      exceptions: [exception({ startTimeUtc: '11:00', endTimeUtc: '12:00' })],
    });

    const result = await service.getNext30DaysAvailability(
      MENTOR,
      new Date('2026-11-23T00:00:00.000Z'),
    );
    const windows = result.windows.filter((window) => window.startUtc.startsWith('2026-11-23'));

    expect(windows).toHaveLength(2);
    expect(windows.map((window) => [window.startUtc, window.endUtc])).toEqual([
      ['2026-11-23T10:00:00.000Z', '2026-11-23T11:00:00.000Z'],
      ['2026-11-23T12:00:00.000Z', '2026-11-23T14:00:00.000Z'],
    ]);
    expect(windows[0].timezone).toBe('America/New_York');
    expect(windows[0].displayStart).toContain('2026-11-23');
  });

  it('propagates repository errors instead of reporting availability', async () => {
    const { service, slotRepo } = makeService({ slots: [slot()] });
    slotRepo.find.mockRejectedValueOnce(new Error('postgres down'));

    await expect(service.isAvailable(MENTOR, '2026-11-23T10:30:00.000Z')).rejects.toThrow(
      'postgres down',
    );
  });
});
