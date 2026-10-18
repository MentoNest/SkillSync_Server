import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../../audit/audit.service';
import { User } from '../entities/user.entity';
import { UserStatus } from '../user-status/user-status.enum';
import { UserSuspension } from './entities/user-suspension.entity';
import { SuspensionService } from './suspension.service';

describe('SuspensionService', () => {
  let service: SuspensionService;
  const suspensions = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((v) => v),
    update: jest.fn(),
  };
  const users = { findOne: jest.fn(), save: jest.fn() };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuspensionService,
        { provide: getRepositoryToken(UserSuspension), useValue: suspensions },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(SuspensionService);
  });

  it('suspends permanently when no duration is given and bumps tokenVersion', async () => {
    const user = { id: 'u1', walletAddress: 'GWALLET', tokenVersion: 2, status: UserStatus.ACTIVE } as User;
    users.findOne.mockResolvedValue(user);
    users.save.mockImplementation(async (u) => u);
    suspensions.save.mockImplementation(async (v) => ({ id: 's1', ...v }));

    const record = await service.suspend('u1', 'admin', { reason: 'abuse', days: null });

    expect(record.suspendedUntil).toBeNull();
    expect(user.status).toBe(UserStatus.SUSPENDED);
    expect(user.tokenVersion).toBe(3);
    expect(audit.record).toHaveBeenCalled();
  });

  it('sets an expiry date for temporary suspensions', async () => {
    users.findOne.mockResolvedValue({ id: 'u2', walletAddress: 'GW', tokenVersion: 0, status: UserStatus.ACTIVE });
    users.save.mockImplementation(async (u) => u);
    suspensions.save.mockImplementation(async (v) => ({ id: 's2', ...v }));

    const before = Date.now();
    const record = await service.suspend('u2', 'admin', { reason: 'cooldown', days: 7 });

    expect(record.suspendedUntil).toBeInstanceOf(Date);
    expect(record.suspendedUntil!.getTime()).toBeGreaterThan(before + 6 * 86_400_000);
  });

  it('auto-expires a suspension after its duration on currentSuspension', async () => {
    const expired = {
      id: 's3',
      userId: 'u3',
      reason: 'temp',
      active: true,
      suspendedUntil: new Date(Date.now() - 1000),
    } as UserSuspension;
    suspensions.findOne.mockResolvedValue(expired);
    suspensions.save.mockImplementation(async (v) => v);
    users.findOne.mockResolvedValue({ id: 'u3', status: UserStatus.SUSPENDED });
    users.save.mockImplementation(async (u) => u);

    const result = await service.currentSuspension('u3');

    expect(result).toBeNull();
    expect(expired.active).toBe(false);
  });

  it('checkLogin returns the reason and end date for active suspensions', async () => {
    const until = new Date(Date.now() + 86_400_000);
    suspensions.findOne.mockResolvedValue({ userId: 'u4', reason: 'spam', active: true, suspendedUntil: until });

    const result = await service.checkLogin('u4');
    expect(result).toEqual({ reason: 'spam', suspendedUntil: until });
  });

  it('unsuspends and restores active status', async () => {
    users.findOne.mockResolvedValue({ id: 'u5', status: UserStatus.SUSPENDED });
    users.save.mockImplementation(async (u) => u);
    suspensions.update.mockResolvedValue({ affected: 1 });

    const result = await service.unsuspend('u5', 'admin');
    expect(result).toEqual({ unsuspended: 1 });
    expect(audit.record).toHaveBeenCalled();
  });

  it('listActive filters out expired rows', async () => {
    suspensions.find.mockResolvedValue([
      { userId: 'a', active: true, suspendedUntil: null },
      { userId: 'b', active: true, suspendedUntil: new Date(Date.now() - 5000) },
    ]);
    suspensions.save.mockImplementation(async (v) => v);

    const active = await service.listActive();
    expect(active.map((s) => s.userId)).toEqual(['a']);
  });

  it('throws for unknown users', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(service.suspend('nope', 'admin', { reason: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
