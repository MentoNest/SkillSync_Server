import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProfileDto } from './create-profile.dto';

function make(overrides?: Partial<Record<string, unknown>>) {
  return plainToInstance(CreateProfileDto, { profileType: 'mentor', ...overrides });
}

describe('CreateProfileDto', () => {
  it('passes with minimal required fields (mentor)', async () => {
    expect(await validate(make({ profileType: 'mentor' }))).toHaveLength(0);
  });

  it('passes with minimal required fields (mentee)', async () => {
    expect(await validate(make({ profileType: 'mentee' }))).toHaveLength(0);
  });

  it('fails with an invalid profileType', async () => {
    const errors = await validate(make({ profileType: 'superuser' }));
    expect(errors.find((e) => e.property === 'profileType')).toBeDefined();
  });

  it('fails when bio exceeds 500 characters', async () => {
    const errors = await validate(make({ bio: 'a'.repeat(501) }));
    expect(errors.find((e) => e.property === 'bio')).toBeDefined();
  });

  it('passes with a bio of exactly 500 characters', async () => {
    expect(await validate(make({ bio: 'a'.repeat(500) }))).toHaveLength(0);
  });

  it('fails when skills contains more than 20 items', async () => {
    const errors = await validate(make({ skills: Array(21).fill('javascript') }));
    expect(errors.find((e) => e.property === 'skills')).toBeDefined();
  });

  it('fails when hourlyRate is negative', async () => {
    const errors = await validate(make({ hourlyRate: -10 }));
    expect(errors.find((e) => e.property === 'hourlyRate')).toBeDefined();
  });

  it('passes with a valid hourlyRate', async () => {
    expect(await validate(make({ hourlyRate: 75 }))).toHaveLength(0);
  });

  it('fails with an invalid timezone', async () => {
    const errors = await validate(make({ timezone: 'Not/AReal' }));
    expect(errors.find((e) => e.property === 'timezone')).toBeDefined();
  });

  it('passes with a valid timezone', async () => {
    expect(await validate(make({ timezone: 'Europe/Berlin' }))).toHaveLength(0);
  });

  it('fails when availability slot has invalid day', async () => {
    const errors = await validate(make({
      availability: [{ day: 'funday', startTime: '09:00', endTime: '17:00' }],
    }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('passes with valid nested availability slots', async () => {
    const errors = await validate(make({
      availability: [
        { day: 'monday', startTime: '09:00', endTime: '12:00' },
        { day: 'wednesday', startTime: '14:00', endTime: '18:00' },
      ],
    }));
    expect(errors).toHaveLength(0);
  });

  it('fails when availability exceeds 14 slots', async () => {
    const slots = Array(15).fill({ day: 'monday', startTime: '09:00', endTime: '10:00' });
    const errors = await validate(make({ availability: slots }));
    expect(errors.find((e) => e.property === 'availability')).toBeDefined();
  });
});
