import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAvailabilityExceptionDto } from '../dto/availability-exception.dto';
import { CreateAvailabilitySlotDto } from '../dto/availability-slot.dto';

async function errorsOf(cls: any, plain: object) {
  const dto = plainToInstance(cls, plain);
  const errs = await validate(dto);
  return errs.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('Availability DTO validation', () => {
  it('accepts valid weekly slot', async () => {
    const errs = await errorsOf(CreateAvailabilitySlotDto, {
      dayOfWeek: 1,
      startTimeUtc: '10:00',
      endTimeUtc: '12:00',
      timezone: 'UTC',
    });
    expect(errs).toHaveLength(0);
  });

  it('rejects slot with end before start', async () => {
    const errs = await errorsOf(CreateAvailabilitySlotDto, {
      dayOfWeek: 1,
      startTimeUtc: '12:00',
      endTimeUtc: '10:00',
      timezone: 'UTC',
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects invalid dayOfWeek', async () => {
    const errs = await errorsOf(CreateAvailabilitySlotDto, {
      dayOfWeek: 7,
      startTimeUtc: '10:00',
      endTimeUtc: '12:00',
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects invalid timezone', async () => {
    const errs = await errorsOf(CreateAvailabilitySlotDto, {
      dayOfWeek: 1,
      startTimeUtc: '10:00',
      endTimeUtc: '12:00',
      timezone: 'Mars/Olympus',
    });
    expect(errs.some((e) => /timezone/i.test(e))).toBe(true);
  });

  it('accepts valid exception', async () => {
    const errs = await errorsOf(CreateAvailabilityExceptionDto, {
      date: '2026-12-25',
      startTimeUtc: '00:00',
      endTimeUtc: '23:59',
      reason: 'Holiday',
      isUnavailable: true,
    });
    expect(errs).toHaveLength(0);
  });

  it('rejects invalid exception date format', async () => {
    const errs = await errorsOf(CreateAvailabilityExceptionDto, {
      date: '25-12-2026',
      startTimeUtc: '00:00',
      endTimeUtc: '23:59',
    });
    expect(errs.length).toBeGreaterThan(0);
  });
});
