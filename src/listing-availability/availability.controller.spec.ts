import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { MentorAvailability, DayOfWeek } from './entities/mentor-availability.entity';
import { BlockedTime } from './entities/blocked-time.entity';
import { CreateAvailabilityDto } from './dto/availability.dto';

const MENTOR_ID = '11111111-1111-1111-1111-111111111111';

const mockAvailabilityService = () => ({
  createRule: jest.fn(),
  getRules: jest.fn(),
  getRule: jest.fn(),
  updateRule: jest.fn(),
  deleteRule: jest.fn(),
  blockTime: jest.fn(),
  getBlockedTimes: jest.fn(),
  removeBlock: jest.fn(),
  getAvailableSlots: jest.fn(),
  getAvailableSlotsRange: jest.fn(),
});

function makeRule(): MentorAvailability {
  return Object.assign(new MentorAvailability(), {
    id: 'rule-uuid-1',
    mentorId: MENTOR_ID,
    dayOfWeek: DayOfWeek.MONDAY,
    startTime: '09:00',
    endTime: '17:00',
    timezone: 'UTC',
    slotDurationMinutes: 60,
    bufferMinutes: 0,
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
  });
}

describe('AvailabilityController', () => {
  let controller: AvailabilityController;
  let service: ReturnType<typeof mockAvailabilityService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvailabilityController],
      providers: [{ provide: AvailabilityService, useFactory: mockAvailabilityService }],
    }).compile();

    controller = module.get(AvailabilityController);
    service = module.get(AvailabilityService);
  });

  describe('createRule', () => {
    it('delegates to service and returns result', async () => {
      const rule = makeRule();
      service.createRule.mockResolvedValue(rule);

      const dto: CreateAvailabilityDto = {
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '09:00',
        endTime: '17:00',
      };

      const result = await controller.createRule(dto);
      expect(result).toEqual(rule);
      expect(service.createRule).toHaveBeenCalled();
    });
  });

  describe('getRules', () => {
    it('returns all rules', async () => {
      const rules = [makeRule()];
      service.getRules.mockResolvedValue(rules);
      const result = await controller.getRules();
      expect(result).toEqual(rules);
    });
  });

  describe('getRule', () => {
    it('returns a single rule', async () => {
      const rule = makeRule();
      service.getRule.mockResolvedValue(rule);
      const result = await controller.getRule('rule-uuid-1');
      expect(result).toEqual(rule);
    });
  });

  describe('updateRule', () => {
    it('updates and returns the modified rule', async () => {
      const rule = makeRule();
      service.updateRule.mockResolvedValue({ ...rule, endTime: '18:00' });
      const result = await controller.updateRule('rule-uuid-1', { endTime: '18:00' });
      expect(result.endTime).toBe('18:00');
    });
  });

  describe('deleteRule', () => {
    it('calls service deleteRule', async () => {
      service.deleteRule.mockResolvedValue(undefined);
      await controller.deleteRule('rule-uuid-1');
      expect(service.deleteRule).toHaveBeenCalledWith('rule-uuid-1', expect.any(String));
    });
  });

  describe('blockTime', () => {
    it('creates a blocked period', async () => {
      const block = Object.assign(new BlockedTime(), {
        id: 'block-1',
        mentorId: MENTOR_ID,
        startAt: new Date('2025-07-07T08:00:00Z'),
        endAt: new Date('2025-07-07T12:00:00Z'),
      });
      service.blockTime.mockResolvedValue(block);

      const result = await controller.blockTime({
        startAt: '2025-07-07T08:00:00.000Z',
        endAt: '2025-07-07T12:00:00.000Z',
      });
      expect(result).toEqual(block);
    });
  });

  describe('getAvailableSlots', () => {
    it('returns slot list from service', async () => {
      const slots = [
        {
          startAt: new Date('2025-07-07T09:00:00Z'),
          endAt: new Date('2025-07-07T10:00:00Z'),
          durationMinutes: 60,
          availabilityRuleId: 'rule-uuid-1',
          localStart: '09:00',
          localEnd: '10:00',
          timezone: 'UTC',
        },
      ];
      service.getAvailableSlots.mockResolvedValue(slots);

      const result = await controller.getAvailableSlots(MENTOR_ID, { date: '2025-07-07' });
      expect(result).toEqual(slots);
      expect(service.getAvailableSlots).toHaveBeenCalledWith(MENTOR_ID, { date: '2025-07-07' });
    });
  });

  describe('getAvailableSlotsRange', () => {
    it('returns schedule grouped by date', async () => {
      const schedule = [
        {
          mentorId: MENTOR_ID,
          date: '2025-07-07',
          slots: [],
        },
      ];
      service.getAvailableSlotsRange.mockResolvedValue(schedule);

      const result = await controller.getAvailableSlotsRange(MENTOR_ID, {
        from: '2025-07-07',
        to: '2025-07-13',
      });
      expect(result).toEqual(schedule);
    });
  });
});
