import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AvailabilityService } from './availability.service';
import { AvailabilityException } from './entities/availability-exception.entity';
import { AvailabilitySlot } from './entities/availability-slot.entity';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  const slots = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), delete: jest.fn() };
  const exceptions = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), delete: jest.fn() };

  const slot = (over: Partial<AvailabilitySlot> = {}): AvailabilitySlot =>
    ({ id: 's1', mentorId: 'm1', dayOfWeek: 1, startTime: '10:00', endTime: '12:00', timezone: 'UTC', ...over }) as AvailabilitySlot;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: getRepositoryToken(AvailabilitySlot), useValue: slots },
        { provide: getRepositoryToken(AvailabilityException), useValue: exceptions },
      ],
    }).compile();
    service = module.get(AvailabilityService);
  });

  it('rejects a slot whose end time is not after its start time', async () => {
    slots.find.mockResolvedValue([]);
    await expect(
      service.createSlot('m1', { dayOfWeek: 1, startTime: '12:00', endTime: '10:00' }),
    ).rejects.toThrow();
  });

  it('rejects overlapping slots', async () => {
    slots.find.mockResolvedValue([slot()]);
    await expect(
      service.createSlot('m1', { dayOfWeek: 1, startTime: '11:00', endTime: '13:00' }),
    ).rejects.toThrow();
  });

  it('creates a non-overlapping slot', async () => {
    slots.find.mockResolvedValue([slot()]);
    slots.create.mockImplementation((v) => v);
    slots.save.mockImplementation(async (v) => ({ ...v, id: 'new' }));
    const created = await service.createSlot('m1', { dayOfWeek: 1, startTime: '12:00', endTime: '13:00' });
    expect(created.startTime).toBe('12:00');
    expect(slots.save).toHaveBeenCalled();
  });

  it('detects overlaps ignoring the excluded slot', async () => {
    slots.find.mockResolvedValue([slot({ id: 's1' })]);
    await expect(service.hasOverlap('m1', 1, '10:00', '12:00')).resolves.toBe(true);
    await expect(service.hasOverlap('m1', 1, '10:00', '12:00', 's1')).resolves.toBe(false);
    await expect(service.hasOverlap('m1', 2, '10:00', '12:00')).resolves.toBe(false);
  });

  it('throws when deleting a missing slot', async () => {
    slots.delete.mockResolvedValue({ affected: 0 });
    await expect(service.deleteSlot('m1', 'missing')).rejects.toThrow();
  });

  describe('isAvailable', () => {
    it('is true inside a weekly slot', async () => {
      slots.find.mockResolvedValue([slot()]);
      exceptions.find.mockResolvedValue([]);
      await expect(service.isAvailable('m1', '2024-06-03T10:30:00Z')).resolves.toBe(true);
    });

    it('is false outside the slot window', async () => {
      slots.find.mockResolvedValue([slot()]);
      exceptions.find.mockResolvedValue([]);
      await expect(service.isAvailable('m1', '2024-06-03T13:00:00Z')).resolves.toBe(false);
    });

    it('is false on a different weekday', async () => {
      slots.find.mockResolvedValue([slot()]);
      exceptions.find.mockResolvedValue([]);
      await expect(service.isAvailable('m1', '2024-06-04T10:30:00Z')).resolves.toBe(false);
    });

    it('is blocked by a full-day exception', async () => {
      slots.find.mockResolvedValue([slot()]);
      exceptions.find.mockResolvedValue([
        { date: '2024-06-03', startTime: null, endTime: null } as AvailabilityException,
      ]);
      await expect(service.isAvailable('m1', '2024-06-03T10:30:00Z')).resolves.toBe(false);
    });

    it('is false when the mentor has no slots', async () => {
      slots.find.mockResolvedValue([]);
      await expect(service.isAvailable('m1', '2024-06-03T10:30:00Z')).resolves.toBe(false);
    });
  });

  describe('slotsForNextDays', () => {
    it('expands weekly slots and excludes exception days', async () => {
      slots.find.mockResolvedValue([slot()]);
      exceptions.find.mockResolvedValue([]);
      const all = await service.slotsForNextDays('m1', 30);
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((o) => o.dayOfWeek === 1)).toBe(true);

      exceptions.find.mockResolvedValue([
        { date: all[0].date, startTime: null, endTime: null } as AvailabilityException,
      ]);
      const filtered = await service.slotsForNextDays('m1', 30);
      expect(filtered.length).toBe(all.length - 1);
    });
  });
});
