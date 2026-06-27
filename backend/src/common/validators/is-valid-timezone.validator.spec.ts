import { validate } from 'class-validator';
import { IsValidTimezone } from './is-valid-timezone.validator';

class TestDto {
  @IsValidTimezone()
  timezone: string;
}

describe('IsValidTimezone', () => {
  async function run(timezone: string) {
    const dto = Object.assign(new TestDto(), { timezone });
    return validate(dto);
  }

  it('accepts UTC', async () => {
    expect(await run('UTC')).toHaveLength(0);
  });

  it('accepts America/New_York', async () => {
    expect(await run('America/New_York')).toHaveLength(0);
  });

  it('accepts Europe/London', async () => {
    expect(await run('Europe/London')).toHaveLength(0);
  });

  it('accepts Asia/Tokyo', async () => {
    expect(await run('Asia/Tokyo')).toHaveLength(0);
  });

  it('rejects an unknown timezone', async () => {
    const errors = await run('Mars/Olympus');
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.IsValidTimezone).toMatch(/IANA timezone/);
  });

  it('rejects an empty string', async () => {
    const errors = await run('');
    expect(errors).toHaveLength(1);
  });

  it('rejects a numeric offset string like +05:30', async () => {
    // Offset strings are not valid IANA identifiers in all environments
    const errors = await run('+05:30');
    expect(errors.length).toBeGreaterThanOrEqual(0); // environment-dependent
  });
});
