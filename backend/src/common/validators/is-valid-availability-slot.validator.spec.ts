import { validate } from 'class-validator';
import { IsValidAvailabilitySlot } from './is-valid-availability-slot.validator';

class TestDto {
  @IsValidAvailabilitySlot()
  availability: unknown;
}

function makeDto(availability: unknown) {
  return Object.assign(new TestDto(), { availability });
}

describe('IsValidAvailabilitySlot', () => {
  it('accepts a valid single slot', async () => {
    const errors = await validate(makeDto({ day: 'monday', startTime: '09:00', endTime: '17:00' }));
    expect(errors).toHaveLength(0);
  });

  it('accepts an array of valid slots', async () => {
    const errors = await validate(makeDto([
      { day: 'monday', startTime: '09:00', endTime: '12:00' },
      { day: 'friday', startTime: '14:00', endTime: '18:00' },
    ]));
    expect(errors).toHaveLength(0);
  });

  it('accepts all weekday values', async () => {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      const errors = await validate(makeDto({ day, startTime: '08:00', endTime: '10:00' }));
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects when endTime equals startTime', async () => {
    const errors = await validate(makeDto({ day: 'monday', startTime: '09:00', endTime: '09:00' }));
    expect(errors).toHaveLength(1);
  });

  it('rejects when endTime is before startTime', async () => {
    const errors = await validate(makeDto({ day: 'monday', startTime: '17:00', endTime: '09:00' }));
    expect(errors).toHaveLength(1);
  });

  it('rejects an invalid day name', async () => {
    const errors = await validate(makeDto({ day: 'funday', startTime: '09:00', endTime: '17:00' }));
    expect(errors).toHaveLength(1);
  });

  it('rejects invalid time format', async () => {
    const errors = await validate(makeDto({ day: 'monday', startTime: '9:00', endTime: '17:00' }));
    expect(errors).toHaveLength(1);
  });

  it('rejects time out of range', async () => {
    const errors = await validate(makeDto({ day: 'monday', startTime: '25:00', endTime: '26:00' }));
    expect(errors).toHaveLength(1);
  });

  it('rejects non-object input', async () => {
    const errors = await validate(makeDto('monday 9-5'));
    expect(errors).toHaveLength(1);
  });

  it('includes a descriptive error message', async () => {
    const errors = await validate(makeDto({ day: 'invalid', startTime: '9:0', endTime: 'bad' }));
    expect(errors[0].constraints?.IsValidAvailabilitySlot).toContain('availability slot');
  });
});
