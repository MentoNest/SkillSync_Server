import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSessionDto } from './create-session.dto';

const MENTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const MENTEE_ID = '550e8400-e29b-41d4-a716-446655440001';

function make(overrides?: Partial<CreateSessionDto>) {
  return plainToInstance(CreateSessionDto, {
    mentorId: MENTOR_ID,
    menteeId: MENTEE_ID,
    startTime: '2025-09-01T10:00:00Z',
    endTime: '2025-09-01T11:00:00Z',
    ...overrides,
  });
}

describe('CreateSessionDto', () => {
  it('passes with all valid required fields', async () => {
    expect(await validate(make())).toHaveLength(0);
  });

  it('passes with optional fields included', async () => {
    const errors = await validate(make({ notes: 'discuss goals', meetingUrl: 'https://meet.example.com' }));
    expect(errors).toHaveLength(0);
  });

  it('fails when mentorId is not a valid UUID', async () => {
    const errors = await validate(make({ mentorId: 'not-a-uuid' }));
    expect(errors.find((e) => e.property === 'mentorId')).toBeDefined();
  });

  it('fails when menteeId is not a valid UUID', async () => {
    const errors = await validate(make({ menteeId: 'not-a-uuid' }));
    expect(errors.find((e) => e.property === 'menteeId')).toBeDefined();
  });

  it('fails when startTime is not a valid ISO date string', async () => {
    const errors = await validate(make({ startTime: '2025-13-01T10:00:00Z' }));
    expect(errors.find((e) => e.property === 'startTime')).toBeDefined();
  });

  it('fails when endTime is not a valid ISO date string', async () => {
    const errors = await validate(make({ endTime: 'not-a-date' }));
    expect(errors.find((e) => e.property === 'endTime')).toBeDefined();
  });

  it('fails when endTime is before startTime', async () => {
    const errors = await validate(make({
      startTime: '2025-09-01T11:00:00Z',
      endTime: '2025-09-01T10:00:00Z',
    }));
    const endTimeErrors = errors.find((e) => e.property === 'endTime');
    expect(endTimeErrors).toBeDefined();
    expect(endTimeErrors!.constraints?.IsAfterDate).toContain('startTime');
  });

  it('fails when endTime equals startTime', async () => {
    const errors = await validate(make({
      startTime: '2025-09-01T10:00:00Z',
      endTime: '2025-09-01T10:00:00Z',
    }));
    expect(errors.find((e) => e.property === 'endTime')).toBeDefined();
  });

  it('strips extra unknown properties', async () => {
    const dto = plainToInstance(CreateSessionDto, {
      mentorId: MENTOR_ID,
      menteeId: MENTEE_ID,
      startTime: '2025-09-01T10:00:00Z',
      endTime: '2025-09-01T11:00:00Z',
      extra: 'value',
    });
    expect((dto as any).extra).toBeUndefined();
  });
});
