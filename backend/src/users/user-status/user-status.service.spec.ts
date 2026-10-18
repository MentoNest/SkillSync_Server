import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { User } from '../entities/user.entity';
import { UserStatus, canTransition } from './user-status.enum';
import { UserStatusService } from './user-status.service';

describe('UserStatusService', () => {
  let service: UserStatusService;
  const users = { findOne: jest.fn(), save: jest.fn() };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserStatusService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(UserStatusService);
  });

  it('allows active -> suspended and audits the change', async () => {
    const user = { id: 'u1', status: UserStatus.ACTIVE } as User;
    users.findOne.mockResolvedValue(user);
    users.save.mockImplementation(async (u) => u);

    const result = await service.changeStatus('u1', UserStatus.SUSPENDED, 'admin1');

    expect(result.status).toBe(UserStatus.SUSPENDED);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.USER_STATUS_CHANGED, userId: 'u1' }),
    );
  });

  it('forbids deleted -> active transitions', async () => {
    users.findOne.mockResolvedValue({ id: 'u2', status: UserStatus.DELETED } as User);
    await expect(service.changeStatus('u2', UserStatus.ACTIVE)).rejects.toBeInstanceOf(BadRequestException);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('throws when the user does not exist', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(service.changeStatus('missing', UserStatus.SUSPENDED)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is a no-op when the status is unchanged', async () => {
    users.findOne.mockResolvedValue({ id: 'u3', status: UserStatus.ACTIVE } as User);
    await service.changeStatus('u3', UserStatus.ACTIVE);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('activeOnly returns criteria hiding non-active users', () => {
    expect(service.activeOnly()).toEqual({ status: UserStatus.ACTIVE });
  });

  it('canTransition guards terminal deleted state', () => {
    expect(canTransition(UserStatus.DELETED, UserStatus.ACTIVE)).toBe(false);
    expect(canTransition(UserStatus.ACTIVE, UserStatus.DELETED)).toBe(true);
  });
});
