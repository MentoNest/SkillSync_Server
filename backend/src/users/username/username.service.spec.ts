import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { User } from '../entities/user.entity';
import { UsernameService } from './username.service';

describe('UsernameService', () => {
  let service: UsernameService;
  const users = { findOne: jest.fn(), save: jest.fn() };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsernameService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(UsernameService);
  });

  it('validates the username format', () => {
    expect(service.isValid('jane_mentor')).toBe(true);
    expect(service.isValid('abc')).toBe(true);
    expect(service.isValid('ab')).toBe(false);
    expect(service.isValid('jane__mentor')).toBe(false);
    expect(service.isValid('-jane')).toBe(false);
    expect(service.isValid('jane-')).toBe(false);
    expect(service.isValid('jane mentor')).toBe(false);
  });

  it('reports availability based on the unique lookup', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(service.isAvailable('fresh_name')).resolves.toBe(true);

    users.findOne.mockResolvedValue({ id: 'taken' });
    await expect(service.isAvailable('taken_name')).resolves.toBe(false);
  });

  it('rejects invalid usernames on availability checks', async () => {
    await expect(service.isAvailable('no')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces uniqueness on change', async () => {
    users.findOne
      .mockResolvedValueOnce({ id: 'u1', username: 'old' }) // load user
      .mockResolvedValueOnce({ id: 'u2', username: 'taken' }); // lookup username
    await expect(service.changeUsername('u1', 'taken')).rejects.toBeInstanceOf(ConflictException);
  });

  it('applies a 30-day cooldown for regular users', async () => {
    users.findOne
      .mockResolvedValueOnce({
        id: 'u1',
        username: 'old',
        usernameChangedAt: new Date(Date.now() - 86_400_000),
        walletAddress: 'GWALLET',
      })
      .mockResolvedValueOnce(null);
    await expect(service.changeUsername('u1', 'new_name')).rejects.toBeInstanceOf(HttpException);
  });

  it('lets admins bypass the cooldown and logs the change', async () => {
    const user = {
      id: 'u1',
      username: 'old',
      displayName: 'Existing',
      usernameChangedAt: new Date(),
      walletAddress: 'GWALLET',
    };
    users.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    users.save.mockImplementation(async (u) => u);

    const result = await service.changeUsername('u1', 'new_name', true);

    expect(result.username).toBe('new_name');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.USERNAME_CHANGED, userId: 'u1' }),
    );
  });

  it('defaults displayName from the wallet prefix when unset', async () => {
    const user = {
      id: 'u1',
      username: 'old',
      displayName: null,
      usernameChangedAt: null,
      walletAddress: 'GABCDEFGHIJ',
    };
    users.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    users.save.mockImplementation(async (u) => u);

    const result = await service.changeUsername('u1', 'new_name');
    expect(result.displayName).toBe('User GABCDEFG');
  });

  it('resolves profiles by id or username', async () => {
    users.findOne.mockResolvedValue({ id: 'abc' });
    await service.resolveProfile('jane_mentor');
    expect(users.findOne).toHaveBeenCalledWith({ where: { username: 'jane_mentor' } });

    await service.resolveProfile('11111111-1111-1111-1111-111111111111');
    expect(users.findOne).toHaveBeenCalledWith({ where: { id: '11111111-1111-1111-1111-111111111111' } });
  });
});
