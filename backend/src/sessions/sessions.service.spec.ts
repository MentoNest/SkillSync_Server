import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionStatus } from './session-rules';

const NOW = new Date('2030-01-01T00:00:00Z');

function build(opts: { available?: boolean; mentorSessions?: any[]; menteeSessions?: any[] } = {}) {
  const lockResults = [opts.mentorSessions ?? [], opts.menteeSessions ?? []];
  const manager: any = {
    createQueryBuilder: jest.fn().mockImplementation(() => {
      const qb: any = {
        setLock: () => qb,
        where: () => qb,
        andWhere: () => qb,
        getMany: () => Promise.resolve(lockResults.shift() ?? []),
      };
      return qb;
    }),
    create: jest.fn((_e: unknown, v: unknown) => v),
    save: jest.fn((v: any) => Promise.resolve({ id: 's1', ...v })),
  };
  const dataSource: any = { transaction: (fn: any) => fn(manager) };
  const repo: any = { findOne: jest.fn(), save: jest.fn((v: unknown) => Promise.resolve(v)) };
  const availability: any = { isAvailable: jest.fn().mockResolvedValue(opts.available ?? true) };
  const notifications: any = { notify: jest.fn().mockResolvedValue(undefined) };
  const service = new SessionsService(repo, dataSource, availability, notifications);
  return { service, repo, manager, availability, notifications };
}

const dto = {
  mentorId: 'mentor-1',
  startTime: '2030-01-02T10:00:00Z',
  endTime: '2030-01-02T11:00:00Z',
};

describe('SessionsService.book', () => {
  it('books a pending session when the mentor is free', async () => {
    const { service, manager, notifications } = build();
    const session = await service.book('mentee-1', dto, NOW);
    expect(session.status).toBe(SessionStatus.PENDING);
    expect(manager.save).toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'mentor-1' }));
  });

  it('rejects a time the mentor is not available', async () => {
    const { service } = build({ available: false });
    await expect(service.book('mentee-1', dto, NOW)).rejects.toThrow(ConflictException);
  });

  it('detects a conflicting mentor session (double booking)', async () => {
    const existing = [{ startTime: new Date('2030-01-02T10:30:00Z'), endTime: new Date('2030-01-02T11:30:00Z') }];
    const { service, manager } = build({ mentorSessions: existing });
    await expect(service.book('mentee-1', dto, NOW)).rejects.toThrow(/mentor already has/);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('detects a conflicting mentee session', async () => {
    const existing = [{ startTime: new Date('2030-01-02T10:00:00Z'), endTime: new Date('2030-01-02T11:00:00Z') }];
    const { service } = build({ menteeSessions: existing });
    await expect(service.book('mentee-1', dto, NOW)).rejects.toThrow(/You already have/);
  });

  it('rejects self-booking and invalid windows', async () => {
    const { service } = build();
    await expect(service.book('mentor-1', dto, NOW)).rejects.toThrow(BadRequestException);
    await expect(
      service.book('mentee-1', { ...dto, endTime: '2030-01-02T09:00:00Z' }, NOW),
    ).rejects.toThrow(BadRequestException);
  });

  it('translates a database exclusion violation into a conflict', async () => {
    const { service, manager } = build();
    manager.save.mockRejectedValue(Object.assign(new Error('overlap'), { code: '23P01' }));
    await expect(service.book('mentee-1', dto, NOW)).rejects.toThrow(ConflictException);
  });
});

describe('SessionsService status workflow and cancellation', () => {
  const session = (status: SessionStatus, start = '2030-01-05T10:00:00Z') => ({
    id: 's1',
    mentorId: 'mentor-1',
    menteeId: 'mentee-1',
    status,
    startTime: new Date(start),
    rating: null,
  });

  it('only the mentor confirms, and only from pending', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValue(session(SessionStatus.PENDING));
    await expect(service.confirm('s1', 'mentee-1')).rejects.toThrow(ForbiddenException);
    expect((await service.confirm('s1', 'mentor-1')).status).toBe(SessionStatus.CONFIRMED);

    repo.findOne.mockResolvedValue(session(SessionStatus.COMPLETED));
    await expect(service.confirm('s1', 'mentor-1')).rejects.toThrow(BadRequestException);
  });

  it('enforces the 24 hour rule on confirmed sessions', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValue(session(SessionStatus.CONFIRMED, '2030-01-01T10:00:00Z'));
    await expect(service.cancel('s1', 'mentee-1', undefined, false, NOW)).rejects.toThrow(/24 hours/);

    repo.findOne.mockResolvedValue(session(SessionStatus.CONFIRMED, '2030-01-05T10:00:00Z'));
    const cancelled = await service.cancel('s1', 'mentee-1', 'busy', false, NOW);
    expect(cancelled.status).toBe(SessionStatus.CANCELLED);
  });

  it('lets pending requests be withdrawn at any time and admins always cancel', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValue(session(SessionStatus.PENDING, '2030-01-01T01:00:00Z'));
    expect((await service.cancel('s1', 'mentee-1', undefined, false, NOW)).status).toBe(SessionStatus.CANCELLED);

    repo.findOne.mockResolvedValue(session(SessionStatus.CONFIRMED, '2030-01-01T01:00:00Z'));
    expect((await service.cancel('s1', 'admin-1', undefined, true, NOW)).status).toBe(SessionStatus.CANCELLED);
  });

  it('rejects cancellation by strangers', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValue(session(SessionStatus.PENDING));
    await expect(service.cancel('s1', 'stranger', undefined, false, NOW)).rejects.toThrow(ForbiddenException);
  });

  it('lets the mentee rate a completed session once', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValue(session(SessionStatus.PENDING));
    await expect(service.rate('s1', 'mentee-1', 5)).rejects.toThrow(BadRequestException);

    repo.findOne.mockResolvedValue({ ...session(SessionStatus.COMPLETED), rating: null });
    expect((await service.rate('s1', 'mentee-1', 5, 'Great')).rating).toBe(5);

    repo.findOne.mockResolvedValue({ ...session(SessionStatus.COMPLETED), rating: 4 });
    await expect(service.rate('s1', 'mentee-1', 5)).rejects.toThrow(ConflictException);
  });
});
