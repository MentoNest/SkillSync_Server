import { ForbiddenException } from '@nestjs/common';
import {
  BusinessRuleException,
  DuplicateResourceException,
} from '../../common/errors/app-exceptions';
import { PaginationService } from '../../common/pagination/pagination.service';
import { QuerySessionsDto } from '../dto/session.dto';
import { Session } from '../entities/session.entity';
import { SessionRole, SessionStatus } from '../session-rules';
import { SessionsService } from '../sessions.service';

const NOW = new Date('2030-01-01T00:00:00Z');
const MENTOR = 'mentor-wallet';
const MENTEE = 'mentee-wallet';

const booking = {
  mentorId: MENTOR,
  startTime: '2030-01-02T10:00:00Z',
  endTime: '2030-01-02T11:00:00Z',
};

type Mock = jest.Mock;

type LockQuery = {
  setLock: Mock;
  where: Mock;
  andWhere: Mock;
  getMany: Mock;
};

type HistoryQuery = {
  where: Mock;
  andWhere: Mock;
  orderBy: Mock;
  addOrderBy: Mock;
  skip: Mock;
  take: Mock;
  getMany: Mock;
  getManyAndCount: Mock;
};

const session = (overrides: Partial<Session> = {}): Session =>
  Object.assign(new Session(), {
    id: 'session-1',
    mentorId: MENTOR,
    menteeId: MENTEE,
    startTime: new Date('2030-01-02T10:00:00Z'),
    endTime: new Date('2030-01-02T11:00:00Z'),
    status: SessionStatus.PENDING,
    meetingUrl: null,
    notes: null,
    rating: null,
    review: null,
    cancellationReason: null,
    reminderSentAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });

function build(
  opts: {
    available?: boolean;
    mentorSessions?: Session[];
    menteeSessions?: Session[];
    existing?: Session | null;
    historyRows?: Session[];
    historyTotal?: number;
    dueRows?: Session[];
  } = {},
) {
  const lockResults = [opts.mentorSessions ?? [], opts.menteeSessions ?? []];
  const lockQueries: LockQuery[] = [];
  let historyQuery: HistoryQuery | undefined;

  const createLockQuery = (): LockQuery => {
    const qb: LockQuery = {
      setLock: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn(),
    };
    qb.setLock.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.getMany.mockResolvedValue(lockResults.shift() ?? []);
    lockQueries.push(qb);
    return qb;
  };

  const createHistoryQuery = (): HistoryQuery => {
    const qb: HistoryQuery = {
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
    };
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    qb.addOrderBy.mockReturnValue(qb);
    qb.skip.mockReturnValue(qb);
    qb.take.mockReturnValue(qb);
    qb.getMany.mockResolvedValue(opts.dueRows ?? []);
    qb.getManyAndCount.mockResolvedValue([
      opts.historyRows ?? [],
      opts.historyTotal ?? 0,
    ]);
    historyQuery = qb;
    return qb;
  };

  const manager = {
    createQueryBuilder: jest.fn(createLockQuery),
    create: jest.fn((_entity: unknown, value: Session) => value),
    save: jest.fn((value: Session) =>
      Promise.resolve({ ...value, id: 'session-1' }),
    ),
  };

  const dataSource = {
    transaction: jest.fn((fn: (manager: unknown) => Promise<Session>) =>
      fn(manager),
    ),
  };

  const repo = {
    findOne: jest.fn(() => Promise.resolve(opts.existing ?? null)),
    save: jest.fn((value: Session) => Promise.resolve(value)),
    createQueryBuilder: jest.fn(createHistoryQuery),
  };

  const availability = {
    isAvailable: jest.fn((mentorId: string, start: Date) =>
      Promise.resolve({
        mentorId,
        dateTime: start.toISOString(),
        available: opts.available ?? true,
      }),
    ),
  };

  const service = new SessionsService(
    repo as never,
    dataSource as never,
    availability as never,
    new PaginationService(),
  );

  const getHistoryQuery = (): HistoryQuery => {
    if (!historyQuery) throw new Error('History query builder was not created');
    return historyQuery;
  };

  return { service, repo, manager, availability, lockQueries, getHistoryQuery };
}

describe('SessionsService.book', () => {
  it('books a pending session after checking mentor availability', async () => {
    const { service, manager, availability } = build();

    const result = await service.book(MENTEE, booking, NOW);

    expect(result.status).toBe(SessionStatus.PENDING);
    expect(availability.isAvailable).toHaveBeenCalledWith(
      MENTOR,
      new Date(booking.startTime),
    );
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a time the mentor is not available', async () => {
    const { service, manager } = build({ available: false });

    await expect(service.book(MENTEE, booking, NOW)).rejects.toBeInstanceOf(
      DuplicateResourceException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('detects mentor and mentee double bookings', async () => {
    const overlapping = [
      session({
        startTime: new Date('2030-01-02T10:30:00Z'),
        endTime: new Date('2030-01-02T11:30:00Z'),
      }),
    ];
    const mentorConflict = build({ mentorSessions: overlapping });
    const menteeConflict = build({ menteeSessions: overlapping });

    await expect(
      mentorConflict.service.book(MENTEE, booking, NOW),
    ).rejects.toThrow(/mentor already has/);
    await expect(
      menteeConflict.service.book(MENTEE, booking, NOW),
    ).rejects.toThrow(/You already have/);
    expect(mentorConflict.manager.save).not.toHaveBeenCalled();
    expect(menteeConflict.manager.save).not.toHaveBeenCalled();
  });

  it('rejects self-booking and invalid windows', async () => {
    const { service, manager } = build();

    await expect(service.book(MENTOR, booking, NOW)).rejects.toBeInstanceOf(
      BusinessRuleException,
    );
    await expect(
      service.book(
        MENTEE,
        { ...booking, endTime: '2030-01-02T09:00:00Z' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('translates a database exclusion violation into a conflict', async () => {
    const { service, manager } = build();
    manager.save.mockRejectedValueOnce(
      Object.assign(new Error('overlap'), { code: '23P01' }),
    );

    await expect(service.book(MENTEE, booking, NOW)).rejects.toBeInstanceOf(
      DuplicateResourceException,
    );
  });
});

describe('SessionsService.reschedule', () => {
  const newTimes = {
    startTime: '2030-01-03T10:00:00Z',
    endTime: '2030-01-03T11:00:00Z',
  };

  it('rechecks availability and locks while excluding the current session', async () => {
    const { service, manager, availability, lockQueries } = build({
      existing: session({ reminderSentAt: NOW }),
    });

    const result = await service.reschedule(
      'session-1',
      MENTEE,
      newTimes,
      false,
      NOW,
    );

    expect(result.startTime).toEqual(new Date(newTimes.startTime));
    expect(result.reminderSentAt).toBeNull();
    expect(availability.isAvailable).toHaveBeenCalledWith(
      MENTOR,
      new Date(newTimes.startTime),
    );
    expect(lockQueries).toHaveLength(2);
    expect(lockQueries[0].andWhere).toHaveBeenCalledWith('s.id != :sessionId', {
      sessionId: 'session-1',
    });
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a conflicting new time', async () => {
    const conflict = [
      session({
        startTime: new Date('2030-01-03T10:30:00Z'),
        endTime: new Date('2030-01-03T11:30:00Z'),
      }),
    ];
    const { service, manager } = build({
      existing: session(),
      mentorSessions: conflict,
    });

    await expect(
      service.reschedule('session-1', MENTEE, newTimes, false, NOW),
    ).rejects.toThrow(/mentor already has/);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects unavailable mentors and final sessions', async () => {
    const unavailable = build({ existing: session(), available: false });
    const completed = build({
      existing: session({ status: SessionStatus.COMPLETED }),
    });

    await expect(
      unavailable.service.reschedule('session-1', MENTEE, newTimes, false, NOW),
    ).rejects.toBeInstanceOf(DuplicateResourceException);
    await expect(
      completed.service.reschedule('session-1', MENTEE, newTimes, false, NOW),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('rejects strangers unless an admin overrides', async () => {
    const { service } = build({ existing: session() });

    await expect(
      service.reschedule('session-1', 'stranger', newTimes, false, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.reschedule('session-1', 'stranger', newTimes, true, NOW),
    ).resolves.toMatchObject({ id: 'session-1' });
  });
});

describe('SessionsService status workflow', () => {
  it('confirms only as the mentor and only from pending', async () => {
    const { service, repo } = build({ existing: session() });

    await expect(service.confirm('session-1', MENTEE)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.confirm('session-1', MENTOR)).resolves.toMatchObject({
      status: SessionStatus.CONFIRMED,
    });

    repo.findOne.mockResolvedValueOnce(
      session({ status: SessionStatus.COMPLETED }),
    );
    await expect(service.confirm('session-1', MENTOR)).rejects.toBeInstanceOf(
      BusinessRuleException,
    );
  });

  it('completes and marks no-shows only from confirmed', async () => {
    const completed = build({
      existing: session({ status: SessionStatus.CONFIRMED }),
    });
    const noShow = build({
      existing: session({ status: SessionStatus.CONFIRMED }),
    });

    await expect(
      completed.service.complete('session-1', MENTOR),
    ).resolves.toMatchObject({
      status: SessionStatus.COMPLETED,
    });
    await expect(
      noShow.service.markNoShow('session-1', MENTOR),
    ).resolves.toMatchObject({
      status: SessionStatus.NO_SHOW,
    });
    await expect(
      noShow.service.complete('session-1', MENTOR),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('enforces the 24 hour notice rule on confirmed sessions', async () => {
    const soon = build({
      existing: session({
        status: SessionStatus.CONFIRMED,
        startTime: new Date('2030-01-01T10:00:00Z'),
      }),
    });
    const later = build({
      existing: session({ status: SessionStatus.CONFIRMED }),
    });

    await expect(
      soon.service.cancel('session-1', MENTEE, 'busy', false, NOW),
    ).rejects.toThrow(/24 hours/);

    const cancelled = await later.service.cancel(
      'session-1',
      MENTEE,
      'busy',
      false,
      NOW,
    );
    expect(cancelled.status).toBe(SessionStatus.CANCELLED);
    expect(cancelled.cancellationReason).toBe('busy');
  });

  it('allows pending withdrawals and admin overrides', async () => {
    const pending = build({
      existing: session({ startTime: new Date('2030-01-01T01:00:00Z') }),
    });
    const confirmed = build({
      existing: session({
        status: SessionStatus.CONFIRMED,
        startTime: new Date('2030-01-01T01:00:00Z'),
      }),
    });

    await expect(
      pending.service.cancel('session-1', MENTEE, undefined, false, NOW),
    ).resolves.toMatchObject({ status: SessionStatus.CANCELLED });
    await expect(
      confirmed.service.cancel(
        'session-1',
        'admin-wallet',
        undefined,
        true,
        NOW,
      ),
    ).resolves.toMatchObject({ status: SessionStatus.CANCELLED });
  });

  it('rejects cancellation by strangers', async () => {
    const { service } = build({ existing: session() });

    await expect(
      service.cancel('session-1', 'stranger', undefined, false, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SessionsService.rate', () => {
  it('only rates completed sessions once', async () => {
    const pending = build({ existing: session() });
    const completed = build({
      existing: session({ status: SessionStatus.COMPLETED }),
    });

    await expect(
      pending.service.rate('session-1', MENTEE, 5),
    ).rejects.toBeInstanceOf(BusinessRuleException);
    await expect(
      completed.service.rate('session-1', MENTEE, 5, 'Great'),
    ).resolves.toMatchObject({
      rating: 5,
      review: 'Great',
    });
    await expect(
      completed.service.rate('session-1', MENTEE, 4),
    ).rejects.toBeInstanceOf(DuplicateResourceException);
  });

  it('rejects out-of-range ratings and non-mentees', async () => {
    const { service } = build({
      existing: session({ status: SessionStatus.COMPLETED }),
    });

    await expect(service.rate('session-1', MENTEE, 0)).rejects.toBeInstanceOf(
      BusinessRuleException,
    );
    await expect(service.rate('session-1', MENTEE, 6)).rejects.toBeInstanceOf(
      BusinessRuleException,
    );
    await expect(
      service.rate('session-1', 'stranger', 5),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SessionsService.history', () => {
  it('filters, sorts and paginates history', async () => {
    const rows = [session()];
    const { service, getHistoryQuery } = build({
      historyRows: rows,
      historyTotal: 3,
    });
    const query: QuerySessionsDto = Object.assign(new QuerySessionsDto(), {
      page: 2,
      limit: 1,
      order: 'ASC',
      sortBy: 'createdAt',
      status: SessionStatus.CONFIRMED,
      role: SessionRole.MENTEE,
      from: '2030-01-01T00:00:00Z',
      to: '2030-01-31T00:00:00Z',
    });

    const result = await service.history(MENTEE, query);

    expect(result.data).toEqual(rows);
    expect(result.meta).toMatchObject({
      page: 2,
      limit: 1,
      total: 3,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
    expect(getHistoryQuery().where).toHaveBeenCalledWith(
      's.menteeId = :userId',
      {
        userId: MENTEE,
      },
    );
    expect(getHistoryQuery().andWhere).toHaveBeenCalledWith(
      's.status = :status',
      {
        status: SessionStatus.CONFIRMED,
      },
    );
    expect(getHistoryQuery().orderBy).toHaveBeenCalledWith(
      's.createdAt',
      'ASC',
    );
    expect(getHistoryQuery().skip).toHaveBeenCalledWith(1);
  });

  it('searches both mentor and mentee columns by default', async () => {
    const { service, getHistoryQuery } = build();
    const query: QuerySessionsDto = Object.assign(new QuerySessionsDto(), {});

    await service.history(MENTEE, query);

    expect(getHistoryQuery().where).toHaveBeenCalledWith(expect.anything(), {
      userId: MENTEE,
    });
  });
});

describe('SessionsService reminders', () => {
  it('marks a session reminded by the placeholder', async () => {
    const { service, repo } = build();
    const target = session();

    await service.sendReminder(target, NOW);

    expect(target.reminderSentAt).toEqual(NOW);
    expect(repo.save).toHaveBeenCalledWith(target);
  });

  it('finds due confirmed sessions', async () => {
    const due = [session({ status: SessionStatus.CONFIRMED })];
    const { service, repo, getHistoryQuery } = build({ dueRows: due });

    await expect(service.sendDueReminders(NOW)).resolves.toBe(1);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(getHistoryQuery().andWhere).toHaveBeenCalledWith(
      's.reminderSentAt IS NULL',
    );
  });
});
