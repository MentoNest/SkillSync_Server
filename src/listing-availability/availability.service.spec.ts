import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { MentorAvailability, DayOfWeek } from './entities/mentor-availability.entity';
import { BlockedTime } from './entities/blocked-time.entity';
import { CreateAvailabilityDto } from './dto/availability.dto';

// ─── Factories ────────────────────────────────────────────────────────────────

const MENTOR_ID = '11111111-1111-1111-1111-111111111111';

function makeRule(overrides: Partial<MentorAvailability> = {}): MentorAvailability {
  return Object.assign(new MentorAvailability(), {
    id: 'rule-uuid-1',
    mentorId: MENTOR_ID,
    dayOfWeek: DayOfWeek.MONDAY,
    startTime: '09:00',
    endTime: '11:00',
    timezone: 'UTC',
    slotDurationMinutes: 60,
    bufferMinutes: 0,
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeBlock(overrides: Partial<BlockedTime> = {}): BlockedTime {
  return Object.assign(new BlockedTime(), {
    id: 'block-uuid-1',
    mentorId: MENTOR_ID,
    startAt: new Date('2025-07-07T08:00:00.000Z'),
    endAt: new Date('2025-07-07T12:00:00.000Z'),
    reason: 'vacation',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

// ─── Mock Repository ──────────────────────────────────────────────────────────

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const mockAvailabilityRepo = (): MockRepo<MentorAvailability> => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockBlockedTimeRepo = (): MockRepo<BlockedTime> => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  }),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let availabilityRepo: MockRepo<MentorAvailability>;
  let blockedTimeRepo: MockRepo<BlockedTime>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: getRepositoryToken(MentorAvailability), useFactory: mockAvailabilityRepo },
        { provide: getRepositoryToken(BlockedTime), useFactory: mockBlockedTimeRepo },
      ],
    }).compile();

    service = module.get(AvailabilityService);
    availabilityRepo = module.get(getRepositoryToken(MentorAvailability));
    blockedTimeRepo = module.get(getRepositoryToken(BlockedTime));
  });

  // ─── createRule ─────────────────────────────────────────────────────────

  describe('createRule', () => {
    const dto: CreateAvailabilityDto = {
      dayOfWeek: DayOfWeek.MONDAY,
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'UTC',
      slotDurationMinutes: 60,
    };

    it('creates and returns a rule', async () => {
      const rule = makeRule();
      availabilityRepo.create!.mockReturnValue(rule);
      availabilityRepo.save!.mockResolvedValue(rule);

      const result = await service.createRule(MENTOR_ID, dto);
      expect(result).toEqual(rule);
      expect(availabilityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ mentorId: MENTOR_ID, dayOfWeek: DayOfWeek.MONDAY }),
      );
    });

    it('throws when startTime >= endTime', async () => {
      await expect(
        service.createRule(MENTOR_ID, { ...dto, startTime: '17:00', endTime: '09:00' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when window is shorter than slot duration', async () => {
      await expect(
        service.createRule(MENTOR_ID, {
          ...dto,
          startTime: '09:00',
          endTime: '09:30',
          slotDurationMinutes: 60,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when effectiveFrom > effectiveTo', async () => {
      await expect(
        service.createRule(MENTOR_ID, {
          ...dto,
          effectiveFrom: '2025-12-31',
          effectiveTo: '2025-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getRules ───────────────────────────────────────────────────────────

  describe('getRules', () => {
    it('returns sorted rules for mentor', async () => {
      const rules = [makeRule()];
      availabilityRepo.find!.mockResolvedValue(rules);

      const result = await service.getRules(MENTOR_ID);
      expect(result).toEqual(rules);
      expect(availabilityRepo.find).toHaveBeenCalledWith({
        where: { mentorId: MENTOR_ID },
        order: { dayOfWeek: 'ASC', startTime: 'ASC' },
      });
    });
  });

  // ─── getRule ────────────────────────────────────────────────────────────

  describe('getRule', () => {
    it('returns the rule when found', async () => {
      const rule = makeRule();
      availabilityRepo.findOne!.mockResolvedValue(rule);
      const result = await service.getRule('rule-uuid-1', MENTOR_ID);
      expect(result).toEqual(rule);
    });

    it('throws NotFoundException when not found', async () => {
      availabilityRepo.findOne!.mockResolvedValue(null);
      await expect(service.getRule('missing', MENTOR_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateRule ─────────────────────────────────────────────────────────

  describe('updateRule', () => {
    it('merges changes and saves', async () => {
      const rule = makeRule();
      const updated = { ...rule, endTime: '18:00' };
      availabilityRepo.findOne!.mockResolvedValue(rule);
      availabilityRepo.save!.mockResolvedValue(updated);

      const result = await service.updateRule('rule-uuid-1', MENTOR_ID, { endTime: '18:00' });
      expect(result.endTime).toBe('18:00');
    });

    it('throws if resulting time window is invalid', async () => {
      const rule = makeRule({ startTime: '09:00', endTime: '17:00', slotDurationMinutes: 60 });
      availabilityRepo.findOne!.mockResolvedValue(rule);

      await expect(
        service.updateRule('rule-uuid-1', MENTOR_ID, { endTime: '09:30', slotDurationMinutes: 60 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── deleteRule ─────────────────────────────────────────────────────────

  describe('deleteRule', () => {
    it('removes the rule', async () => {
      const rule = makeRule();
      availabilityRepo.findOne!.mockResolvedValue(rule);
      availabilityRepo.remove!.mockResolvedValue(rule);

      await service.deleteRule('rule-uuid-1', MENTOR_ID);
      expect(availabilityRepo.remove).toHaveBeenCalledWith(rule);
    });
  });

  // ─── blockTime ──────────────────────────────────────────────────────────

  describe('blockTime', () => {
    const dto = {
      startAt: '2025-07-07T08:00:00.000Z',
      endAt: '2025-07-07T12:00:00.000Z',
    };

    it('creates a block when no overlap exists', async () => {
      const block = makeBlock();
      // findOverlappingBlocks returns empty (no overlap)
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      blockedTimeRepo.createQueryBuilder!.mockReturnValue(qbMock);
      blockedTimeRepo.create!.mockReturnValue(block);
      blockedTimeRepo.save!.mockResolvedValue(block);

      const result = await service.blockTime(MENTOR_ID, dto);
      expect(result).toEqual(block);
    });

    it('throws ConflictException when overlapping block exists', async () => {
      const existingBlock = makeBlock();
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([existingBlock]),
      };
      blockedTimeRepo.createQueryBuilder!.mockReturnValue(qbMock);

      await expect(service.blockTime(MENTOR_ID, dto)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when startAt >= endAt', async () => {
      await expect(
        service.blockTime(MENTOR_ID, {
          startAt: '2025-07-07T12:00:00.000Z',
          endAt: '2025-07-07T08:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getAvailableSlots ──────────────────────────────────────────────────

  describe('getAvailableSlots', () => {
    // Monday 2025-07-07
    const MONDAY = '2025-07-07';

    it('generates correct number of slots from a rule', async () => {
      // 09:00–11:00 UTC, 60-min slots → 2 slots
      const rule = makeRule({
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '09:00',
        endTime: '11:00',
        slotDurationMinutes: 60,
        bufferMinutes: 0,
        timezone: 'UTC',
        isActive: true,
      });
      availabilityRepo.find!.mockResolvedValue([rule]);
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      blockedTimeRepo.createQueryBuilder!.mockReturnValue(qbMock);
      blockedTimeRepo.find!.mockResolvedValue([]);

      const slots = await service.getAvailableSlots(MENTOR_ID, { date: MONDAY });
      expect(slots).toHaveLength(2);
      expect(slots[0].localStart).toBe('09:00');
      expect(slots[0].localEnd).toBe('10:00');
      expect(slots[1].localStart).toBe('10:00');
      expect(slots[1].localEnd).toBe('11:00');
    });

    it('respects buffer minutes between slots', async () => {
      // 09:00–12:00 UTC, 60-min slots + 30-min buffer → 2 slots (not 3)
      const rule = makeRule({
        startTime: '09:00',
        endTime: '12:00',
        slotDurationMinutes: 60,
        bufferMinutes: 30,
        timezone: 'UTC',
        isActive: true,
      });
      availabilityRepo.find!.mockResolvedValue([rule]);
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      blockedTimeRepo.createQueryBuilder!.mockReturnValue(qbMock);
      blockedTimeRepo.find!.mockResolvedValue([]);

      const slots = await service.getAvailableSlots(MENTOR_ID, { date: MONDAY });
      // 09:00-10:00, gap 10:00-10:30, 10:30-11:30 → 2 slots
      expect(slots).toHaveLength(2);
    });

    it('filters out slots overlapping blocked times', async () => {
      const rule = makeRule({
        startTime: '09:00',
        endTime: '11:00',
        slotDurationMinutes: 60,
        timezone: 'UTC',
        isActive: true,
      });
      availabilityRepo.find!.mockResolvedValue([rule]);

      // Block the first slot 09:00-10:00
      const block = makeBlock({
        startAt: new Date('2025-07-07T09:00:00.000Z'),
        endAt: new Date('2025-07-07T10:00:00.000Z'),
      });
      blockedTimeRepo.find!.mockResolvedValue([block]);
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      blockedTimeRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const slots = await service.getAvailableSlots(MENTOR_ID, { date: MONDAY });
      expect(slots).toHaveLength(1);
      expect(slots[0].localStart).toBe('10:00');
    });

    it('returns empty array when no rules exist for the day', async () => {
      availabilityRepo.find!.mockResolvedValue([]);
      const slots = await service.getAvailableSlots(MENTOR_ID, { date: MONDAY });
      expect(slots).toEqual([]);
    });

    it('excludes externally injected booked windows', async () => {
      const rule = makeRule({
        startTime: '09:00',
        endTime: '11:00',
        slotDurationMinutes: 60,
        timezone: 'UTC',
        isActive: true,
      });
      availabilityRepo.find!.mockResolvedValue([rule]);
      blockedTimeRepo.find!.mockResolvedValue([]);
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      blockedTimeRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const bookedWindows = [
        { startAt: new Date('2025-07-07T10:00:00.000Z'), endAt: new Date('2025-07-07T11:00:00.000Z') },
      ];

      const slots = await service.getAvailableSlots(MENTOR_ID, { date: MONDAY }, bookedWindows);
      expect(slots).toHaveLength(1);
      expect(slots[0].localStart).toBe('09:00');
    });
  });

  // ─── checkSlotAvailable ─────────────────────────────────────────────────

  describe('checkSlotAvailable', () => {
    it('returns true when slot falls within an active rule and is not blocked', async () => {
      const rule = makeRule({
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '09:00',
        endTime: '17:00',
        timezone: 'UTC',
        isActive: true,
      });
      availabilityRepo.find!.mockResolvedValue([rule]);
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      blockedTimeRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.checkSlotAvailable(
        MENTOR_ID,
        new Date('2025-07-07T10:00:00.000Z'),
        new Date('2025-07-07T11:00:00.000Z'),
      );
      expect(result).toBe(true);
    });

    it('returns false when slot falls outside all rules', async () => {
      availabilityRepo.find!.mockResolvedValue([]);
      const result = await service.checkSlotAvailable(
        MENTOR_ID,
        new Date('2025-07-07T10:00:00.000Z'),
        new Date('2025-07-07T11:00:00.000Z'),
      );
      expect(result).toBe(false);
    });

    it('returns false when slot overlaps a blocked time', async () => {
      const rule = makeRule({
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '09:00',
        endTime: '17:00',
        timezone: 'UTC',
        isActive: true,
      });
      availabilityRepo.find!.mockResolvedValue([rule]);
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([makeBlock()]),
      };
      blockedTimeRepo.createQueryBuilder!.mockReturnValue(qbMock);

      const result = await service.checkSlotAvailable(
        MENTOR_ID,
        new Date('2025-07-07T09:00:00.000Z'),
        new Date('2025-07-07T10:00:00.000Z'),
      );
      expect(result).toBe(false);
    });
  });

  // ─── getAvailableSlotsRange ─────────────────────────────────────────────

  describe('getAvailableSlotsRange', () => {
    it('throws when range exceeds 90 days', async () => {
      await expect(
        service.getAvailableSlotsRange(MENTOR_ID, {
          from: '2025-01-01',
          to: '2025-12-31',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when from > to', async () => {
      await expect(
        service.getAvailableSlotsRange(MENTOR_ID, {
          from: '2025-07-10',
          to: '2025-07-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
