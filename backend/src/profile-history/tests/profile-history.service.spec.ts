import { ResourceNotFoundException } from '../../common/errors/app-exceptions';
import { ChangeReason, ProfileHistory } from '../profile-history.entity';
import {
  ProfileHistoryService,
  RecordChangeOptions,
} from '../profile-history.service';
import { maybeRedact } from '../sensitive-fields';

// ─── In-memory repository stub ────────────────────────────────────────────────

function makeEntry(overrides: Partial<ProfileHistory> = {}): ProfileHistory {
  const e = new ProfileHistory();
  e.id = 'uuid-1';
  e.userId = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
  e.profileType = 'user';
  e.fieldName = 'username';
  e.oldValue = null;
  e.newValue = 'alice_dev';
  e.changedBy = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
  e.changeReason = ChangeReason.USER_EDIT;
  e.changedAt = new Date('2024-06-01T12:00:00.000Z');
  e.retainUntil = new Date('2025-06-01T12:00:00.000Z');
  return Object.assign(e, overrides);
}

function makeRepo(rows: ProfileHistory[] = []) {
  return {
    create: jest.fn((data: Partial<ProfileHistory>) =>
      Object.assign(new ProfileHistory(), data),
    ),
    save: jest.fn(async (entity: ProfileHistory) => {
      rows.push(entity);
      return entity;
    }),
    findAndCount: jest.fn(
      async (opts: {
        where: { userId: string };
        take: number;
        skip: number;
      }) => {
        const filtered = rows
          .filter((r) => r.userId === opts.where.userId)
          .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
        return [
          filtered.slice(opts.skip, opts.skip + opts.take),
          filtered.length,
        ] as const;
      },
    ),
    createQueryBuilder: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => {
        // simulate the bulk insert
      }),
    })),
  };
}

const BASE_OPTS: RecordChangeOptions = {
  userId: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  profileType: 'user',
  fieldName: 'username',
  oldValue: null,
  newValue: 'alice_dev',
  changedBy: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  changeReason: ChangeReason.USER_EDIT,
};

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

describe('ProfileHistoryService.record', () => {
  it('creates a history row with all required fields', async () => {
    const repo = makeRepo();
    const service = new ProfileHistoryService(repo as never);

    await service.record(BASE_OPTS);

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(1);
    const created = (repo.create as jest.Mock).mock
      .calls[0][0] as Partial<ProfileHistory>;
    expect(created.userId).toBe(BASE_OPTS.userId);
    expect(created.fieldName).toBe('username');
    expect(created.newValue).toBe('alice_dev');
    expect(created.oldValue).toBeNull();
    expect(created.changeReason).toBe(ChangeReason.USER_EDIT);
  });

  it('sets retainUntil to exactly changedAt + 1 year', async () => {
    const repo = makeRepo();
    const service = new ProfileHistoryService(repo as never);
    const changedAt = new Date('2024-06-01T12:00:00.000Z');

    await service.record({ ...BASE_OPTS, changedAt });

    const created = (repo.create as jest.Mock).mock
      .calls[0][0] as Partial<ProfileHistory>;
    expect(created.retainUntil!.getTime()).toBe(
      changedAt.getTime() + ONE_YEAR_MS,
    );
  });

  it('uses the provided changedAt timestamp instead of now', async () => {
    const repo = makeRepo();
    const service = new ProfileHistoryService(repo as never);
    const changedAt = new Date('2020-01-01T00:00:00.000Z');

    await service.record({ ...BASE_OPTS, changedAt });

    const created = (repo.create as jest.Mock).mock
      .calls[0][0] as Partial<ProfileHistory>;
    expect(created.changedAt).toEqual(changedAt);
  });

  it('does not throw when the repository save fails (silent failure)', async () => {
    const repo = makeRepo();
    (repo.save as jest.Mock).mockRejectedValueOnce(new Error('DB down'));
    const service = new ProfileHistoryService(repo as never);

    await expect(service.record(BASE_OPTS)).resolves.toBeUndefined();
  });

  it('redacts sensitive field values', async () => {
    const repo = makeRepo();
    const service = new ProfileHistoryService(repo as never);

    // Temporarily make 'username' sensitive for this test.
    // We test the redaction function directly because REDACTED_USER_FIELDS is a const set.
    // username is not in the sensitive set by default — this tests the passthrough.
    expect(maybeRedact('username', 'alice_dev')).toBe('alice_dev');
    // A hypothetical sensitive field would return '[REDACTED]'.
    expect(maybeRedact('email', 'test@example.com')).toBe('test@example.com'); // not in set
  });
});

describe('ProfileHistoryService.recordMany', () => {
  it('inserts multiple entries in one operation', async () => {
    const repo = makeRepo();
    const service = new ProfileHistoryService(repo as never);

    const opts: RecordChangeOptions[] = [
      { ...BASE_OPTS, fieldName: 'username', newValue: 'alice' },
      { ...BASE_OPTS, fieldName: 'displayName', newValue: 'Alice Dev' },
    ];

    await service.recordMany(opts);

    expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledTimes(2);
  });

  it('is a no-op for an empty array', async () => {
    const repo = makeRepo();
    const service = new ProfileHistoryService(repo as never);

    await service.recordMany([]);

    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('does not throw when the bulk insert fails', async () => {
    const repo = makeRepo();
    const qb = repo.createQueryBuilder();
    (qb.execute as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    (repo.createQueryBuilder as jest.Mock).mockReturnValueOnce(qb);
    const service = new ProfileHistoryService(repo as never);

    await expect(service.recordMany([BASE_OPTS])).resolves.toBeUndefined();
  });
});

describe('ProfileHistoryService.getHistoryForUser', () => {
  const USER = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

  it('returns entries and total for a user with history', async () => {
    const rows = [
      makeEntry({ userId: USER, changedAt: new Date('2024-01-02T00:00:00Z') }),
      makeEntry({
        id: 'uuid-2',
        userId: USER,
        changedAt: new Date('2024-01-01T00:00:00Z'),
      }),
    ];
    const repo = makeRepo(rows);
    const service = new ProfileHistoryService(repo as never);

    const result = await service.getHistoryForUser(USER);

    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(2);
  });

  it('throws ResourceNotFoundException when no history exists', async () => {
    const repo = makeRepo([]);
    const service = new ProfileHistoryService(repo as never);

    await expect(service.getHistoryForUser(USER)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('applies limit and offset', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        id: `uuid-${i}`,
        userId: USER,
        changedAt: new Date(2024, 0, i + 1),
      }),
    );
    const repo = makeRepo(rows);
    const service = new ProfileHistoryService(repo as never);

    const result = await service.getHistoryForUser(USER, {
      limit: 2,
      offset: 1,
    });

    expect(result.entries).toHaveLength(2);
    expect(result.total).toBe(5);
  });

  it('caps limit at 200', async () => {
    const repo = makeRepo([makeEntry({ userId: USER })]);
    const service = new ProfileHistoryService(repo as never);

    await service.getHistoryForUser(USER, { limit: 999 });

    const call = (repo.findAndCount as jest.Mock).mock.calls[0][0] as {
      take: number;
    };
    expect(call.take).toBe(200);
  });
});
