import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';
import { TimezoneService } from './timezone.service';

describe('TimezoneService', () => {
  let service: TimezoneService;
  const users = { findOne: jest.fn(), update: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TimezoneService, { provide: getRepositoryToken(User), useValue: users }],
    }).compile();
    service = module.get(TimezoneService);
  });

  it('returns the stored valid timezone', async () => {
    users.findOne.mockResolvedValue({ id: 'u1', timezone: 'America/New_York' });
    await expect(service.getUserTimezone('u1')).resolves.toBe('America/New_York');
  });

  it('falls back to UTC when the user is missing or unset', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(service.getUserTimezone('u1')).resolves.toBe('UTC');
    users.findOne.mockResolvedValue({ id: 'u1', timezone: null });
    await expect(service.getUserTimezone('u1')).resolves.toBe('UTC');
  });

  it('falls back to UTC when the stored timezone is invalid', async () => {
    users.findOne.mockResolvedValue({ id: 'u1', timezone: 'Not/AZone' });
    await expect(service.getUserTimezone('u1')).resolves.toBe('UTC');
  });

  it('rejects invalid timezones on write', async () => {
    await expect(service.setUserTimezone('u1', 'Not/AZone')).rejects.toThrow();
    expect(users.update).not.toHaveBeenCalled();
  });

  it('persists a valid timezone', async () => {
    users.update.mockResolvedValue({ affected: 1 });
    await expect(service.setUserTimezone('u1', 'Europe/London')).resolves.toBe('Europe/London');
    expect(users.update).toHaveBeenCalledWith({ id: 'u1' }, { timezone: 'Europe/London' });
  });
});
