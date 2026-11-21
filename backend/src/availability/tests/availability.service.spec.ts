import { BusinessRuleException, ResourceNotFoundException } from '../../common/errors/app-exceptions';
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
    reason: 'Holiday',
    isUnavailable: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

function makeService(opts?: {
  slots?: AvailabilitySlot[];
  exceptions?: AvailabilityException[];
  mentorExists?: boolean;
}) {
  const slots = opts?.slots ?? [];
  const exceptions = opts?.exceptions ?? [];
  const mentorExists = opts?.mentorExists ?? true;

  const slotRepo = {
    find: jest.fn(async ({ where }: any) => {
      return slots.filter((s) => {
        if (where?.mentorId && s.mentorId !== where.mentorId) return false;
        if (where?.dayOfWeek !== undefined && s.dayOfWeek !== where.dayOfWeek) return false;
        if (where?.id && where.id !== s.id) return false;
        return true;
      });
    }),
    findOne: jest.fn(async ({ where }: any) => slots.find((s) => s.id === where.id && s.mentorId === where.mentorId) ?? null),
    create: jest.fn((data: any) => Object.assign(new AvailabilitySlot(), { id: 'new-slot', ...data })),
    save: jest.fn(async (entity: any) => Object.assign(new AvailabilitySlot(), entity)),
    remove: jest.fn(async () => undefined),
  };

  const exceptionRepo = {
    find: jest.fn(async ({ where }: any) => {
      return exceptions.filter((e) => {
        if (where?.mentorId && e.mentorId !== where.mentorId) return false;
        if (where?.date && e.date !== where.date) return false;
        if (where?.id && where.id !== e.id) return false;
        return true;
      });
    }),
    findOne: jest.fn(async ({ where }: any) => exceptions.find((e) => e.id === where.id && e.mentorId === where.mentorId) ?? null),
    create: jest.fn((data: any) => Object.assign(new AvailabilityException(), { id: 'new-exc', ...data })),
    save: jest.fn(async (entity: any) => Object.assign(new AvailabilityException(), entity)),
    remove: jest.fn(async () => undefined),
  };

  const mentorRepo = {
    existsBy: jest.fn(async () => mentorExists),
  };

  const service = new AvailabilityService(slotRepo as any, exceptionRepo as any, mentorRepo as any);
  return { service, slotRepo, exceptionRepo, mentorRepo };
}

describe('AvailabilityService', () => {
  it('rejects slot when end is not after start', async () => {
    const { service } = makeService();
    await expect(
      service.createSlot(MENTOR, { dayOfWeek: 1, startTimeUtc: '12:00', endTimeUtc: '12:00', timezone: 'UTC' }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('detects overlapping weekly slots', async () => {
    const { service } = makeService({ slots: [slot()] });
    await expect(
      service.createSlot(MENTOR, { dayOfWeek: 1, startTimeUtc: '11:00', endTimeUtc: '13:00', timezone: 'UTC' }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('creates slot when no overlap', async () => {
    const { service, slotRepo } = makeService({ slots: [slot()] });
    const created = await service.createSlot(MENTOR, { dayOfWeek: 1, startTimeUtc: '12:00', endTimeUtc: '13:00', timezone: 'UTC' });
    expect(slotRepo.save).toHaveBeenCalled();
    expect(created.startTimeUtc).toBe('12:00');
  });

  it('detects overlapping exceptions on same date', async () => {
    const { service } = makeService({ exceptions: [exception()] });
    await expect(
      service.createException(MENTOR, { date: '2026-11-23', startTimeUtc: '10:30', endTimeUtc: '11:30', isUnavailable: true }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('isAvailable returns true when inside weekly slot and not blocked', async () => {
    const { service } = makeService({ slots: [slot()] });
    const res = await service.isAvailable(MENTOR, '2026-11-23T10:30:00.000Z'); // Monday
    expect(res.available).toBe(true);
  });

  it('isAvailable returns false when blocked by unavailable exception', async () => {
    const { service } = makeService({ slots: [slot()], exceptions: [exception()] });
    const res = await service.isAvailable(MENTOR, '2026-11-23T11:30:00.000Z');
    expect(res.available).toBe(false);
  });

  it('isAvailable returns false when outside any slot', async () => {
    const { service } = makeService({ slots: [slot()] });
    const res = await service.isAvailable(MENTOR, '2026-11-23T09:30:00.000Z');
    expect(res.available).toBe(false);
  });

  it('next 30 days subtracts unavailable exception windows', async () => {
    const { service } = makeService({ slots: [slot()], exceptions: [exception()] });
    const res = await service.getNext30DaysAvailability(MENTOR, new Date('2026-11-23T00:00:00.000Z'));
    // 2026-11-23 is Monday; slot 10:00-12:00 minus exception 11:00-12:00 => 10:00-11:00
    const dayWindows = res.windows.filter((w) => w.startUtc.startsWith('2026-11-23'));
    expect(dayWindows).toHaveLength(1);
    expect(dayWindows[0].startUtc).toBe('2026-11-23T10:00:00.000Z');
    expect(dayWindows[0].endUtc).toBe('2026-11-23T11:00:00.000Z');
  });

  it('throws not found for unknown mentor', async () => {
    const { service } = makeService({ mentorExists: false });
    await expect(service.listSlots(MENTOR)).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});
