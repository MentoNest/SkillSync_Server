import { IsDateString } from 'class-validator';
import { validate } from 'class-validator';
import { IsAfterDate } from './is-after-date.validator';

class TestDto {
  @IsDateString()
  startTime: string;

  @IsDateString()
  @IsAfterDate('startTime')
  endTime: string;
}

describe('IsAfterDate', () => {
  async function run(startTime: string, endTime: string) {
    const dto = Object.assign(new TestDto(), { startTime, endTime });
    return validate(dto);
  }

  it('passes when endTime is after startTime', async () => {
    const errors = await run('2025-09-01T10:00:00Z', '2025-09-01T11:00:00Z');
    expect(errors).toHaveLength(0);
  });

  it('fails when endTime equals startTime', async () => {
    const errors = await run('2025-09-01T10:00:00Z', '2025-09-01T10:00:00Z');
    const endTimeErrors = errors.find((e) => e.property === 'endTime');
    expect(endTimeErrors).toBeDefined();
  });

  it('fails when endTime is before startTime', async () => {
    const errors = await run('2025-09-01T11:00:00Z', '2025-09-01T10:00:00Z');
    const endTimeErrors = errors.find((e) => e.property === 'endTime');
    expect(endTimeErrors).toBeDefined();
    expect(endTimeErrors!.constraints?.IsAfterDate).toContain('startTime');
  });

  it('passes across different dates', async () => {
    const errors = await run('2025-09-01T23:00:00Z', '2025-09-02T01:00:00Z');
    expect(errors).toHaveLength(0);
  });

  it('skips check when endTime is missing (delegates to @IsDateString)', async () => {
    const dto = Object.assign(new TestDto(), { startTime: '2025-09-01T10:00:00Z', endTime: undefined });
    const errors = await validate(dto);
    // @IsDateString will fail, not @IsAfterDate
    const endTimeErrors = errors.find((e) => e.property === 'endTime');
    expect(endTimeErrors?.constraints?.IsAfterDate).toBeUndefined();
  });
});
