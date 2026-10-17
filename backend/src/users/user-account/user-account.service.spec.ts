import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User, UserStatus } from '../entities/user.entity';
import { DEFAULT_GRACE_DAYS, UserAccountService } from './user-account.service';

describe('UserAccountService', () => {
  let service: UserAccountService;
  const users = { findOne: jest.fn(), save: jest.fn(), delete: jest.fn(), find: jest.fn(), findAndCount: jest.fn() };
  const mentors = { update: jest.fn() };
  const audit = { record: jest.fn() };
  const config = { get: jest.fn() };

  const makeUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 'user-1',
      walletAddress: 'GABCDEF',
      status: UserStatus.ACTIVE,
      tokenVersion: 0,
      deletedAt: null,
      ...overrides,
    }) as User;

  beforeEach(async () => {
    jest.clearAllMocks();
    config.get.mockReturnValue(undefined);
    users.save.mockImplementation(async (u: User) => u);
    mentors.update.mockResolvedValue({ affected: 1 });
    audit.record.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAccountService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(MentorProfile), useValue: mentors },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(UserAccountService);
  });

  it('soft deletes the user and cascades to the mentor profile', async () => {
    users.findOne.mockResolvedValue(makeUser());
    const result = await service.softDelete('user-1');

    expect(result.graceDays).toBe(DEFAULT_GRACE_DAYS);
    const saved = users.save.mock.calls[0][0] as User;
    expect(saved.status).toBe(UserStatus.DELETED);
    expect(saved.deletedAt).toBeInstanceOf(Date);
    expect(saved.tokenVersion).toBe(1);
    expect(mentors.update).toHaveBeenCalledWith({ userId: 'user-1' }, { deletedAt: expect.any(Date) });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: AuditEvent.USER_DELETED }));
  });

  it('throws NotFoundException when the user does not exist', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(service.softDelete('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restores a deleted account within the grace period', async () => {
    users.findOne.mockResolvedValue(
      makeUser({ status: UserStatus.DELETED, deletedAt: new Date(Date.now() - 1000) }),
    );
    const user = await service.restore('user-1');

    expect(user.deletedAt).toBeNull();
    expect(user.status).toBe(UserStatus.ACTIVE);
    expect(mentors.update).toHaveBeenCalledWith({ userId: 'user-1' }, { deletedAt: null });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: AuditEvent.USER_RESTORED }));
  });

  it('rejects restore after the grace period with 410', async () => {
    const longAgo = new Date(Date.now() - (DEFAULT_GRACE_DAYS + 1) * 86_400_000);
    users.findOne.mockResolvedValue(makeUser({ status: UserStatus.DELETED, deletedAt: longAgo }));
    await expect(service.restore('user-1')).rejects.toBeInstanceOf(GoneException);
  });

  it('honours a configurable DELETE_GRACE_DAYS value', async () => {
    config.get.mockReturnValue('7');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAccountService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(MentorProfile), useValue: mentors },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    expect(module.get(UserAccountService).gracePeriodDays).toBe(7);
  });

  it('only purges accounts whose grace period has expired', async () => {
    users.findOne.mockResolvedValue(
      makeUser({ status: UserStatus.DELETED, deletedAt: new Date(Date.now() - 1000) }),
    );
    await expect(service.purge('user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(users.delete).not.toHaveBeenCalled();
  });

  it('purges an expired account and records an audit event', async () => {
    const longAgo = new Date(Date.now() - (DEFAULT_GRACE_DAYS + 5) * 86_400_000);
    users.findOne.mockResolvedValue(makeUser({ status: UserStatus.DELETED, deletedAt: longAgo }));
    await expect(service.purge('user-1')).resolves.toEqual({ purged: true });
    expect(users.delete).toHaveBeenCalledWith('user-1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: AuditEvent.USER_PURGED }));
  });

  it('anonymizes expired accounts during the scheduled job', async () => {
    users.find.mockResolvedValue([makeUser({ status: UserStatus.DELETED, deletedAt: new Date(0) })]);
    const count = await service.anonymizeExpired();
    expect(count).toBe(1);
    const saved = users.save.mock.calls[0][0] as User;
    expect(saved.walletAddress).toBe('deleted:user-1');
    expect(saved.displayName).toBeNull();
  });
});
