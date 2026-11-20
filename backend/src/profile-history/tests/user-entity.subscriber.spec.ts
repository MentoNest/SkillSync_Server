import { ChangeReason } from '../profile-history.entity';
import * as contextModule from '../profile-history-context';
import { UserEntitySubscriber } from '../user-entity.subscriber';
import { User } from '../../user/user.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.walletAddress = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
  u.username = null;
  u.displayName = null;
  u.usernameChangedAt = null;
  u.createdAt = new Date('2024-01-01T00:00:00Z');
  return Object.assign(u, overrides);
}

function makeHistoryService() {
  return {
    record: jest.fn().mockResolvedValue(undefined),
    recordMany: jest.fn().mockResolvedValue(undefined),
  };
}

/** Minimal DataSource stub — subscriber registers itself on construction. */
function makeDataSource() {
  return { subscribers: [] as unknown[] };
}

/** Minimal ColumnMetadata stub matching TypeORM's shape. */
function col(propertyName: string) {
  return { propertyName };
}

/** Builds a fake UpdateEvent. */
function makeUpdateEvent(updated: User, previous: User, columns: string[]) {
  return {
    entity: updated,
    databaseEntity: previous,
    metadata: { columns: columns.map(col) },
  };
}

/** Builds a fake InsertEvent. */
function makeInsertEvent(entity: User) {
  return { entity };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UserEntitySubscriber', () => {
  beforeEach(() => {
    jest.spyOn(contextModule, 'getProfileHistoryContext').mockReturnValue({
      changedBy: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
      reason: ChangeReason.USER_EDIT,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('registers itself with the DataSource on construction', () => {
    const ds = makeDataSource();
    new UserEntitySubscriber(ds as never, makeHistoryService() as never);
    expect(ds.subscribers).toHaveLength(1);
  });

  it('listens to the User entity', () => {
    const subscriber = new UserEntitySubscriber(makeDataSource() as never, makeHistoryService() as never);
    expect(subscriber.listenTo()).toBe(User);
  });

  describe('afterInsert', () => {
    it('records initial writes for every non-null, non-ignored field', async () => {
      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);

      const user = makeUser({ username: 'alice_dev', displayName: 'Alice' });
      await subscriber.afterInsert(makeInsertEvent(user) as never);

      expect(historyService.recordMany).toHaveBeenCalledTimes(1);
      const entries = (historyService.recordMany as jest.Mock).mock.calls[0][0] as Array<{
        fieldName: string;
        oldValue: unknown;
        newValue: unknown;
      }>;

      const usernamEntry = entries.find((e) => e.fieldName === 'username');
      expect(usernamEntry).toBeDefined();
      expect(usernamEntry!.oldValue).toBeNull();
      expect(usernamEntry!.newValue).toBe('alice_dev');

      const displayEntry = entries.find((e) => e.fieldName === 'displayName');
      expect(displayEntry).toBeDefined();
      expect(displayEntry!.newValue).toBe('Alice');
    });

    it('skips null fields on insert', async () => {
      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);

      const user = makeUser({ username: null, displayName: null });
      await subscriber.afterInsert(makeInsertEvent(user) as never);

      // No non-null tracked fields → no entries.
      const calls = (historyService.recordMany as jest.Mock).mock.calls;
      const totalEntries = calls.flatMap((c) => c[0] as unknown[]);
      const usernameEntries = totalEntries.filter((e: any) => e.fieldName === 'username');
      expect(usernameEntries).toHaveLength(0);
    });

    it('does not record walletAddress on insert', async () => {
      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);

      const user = makeUser({ username: 'alice' });
      await subscriber.afterInsert(makeInsertEvent(user) as never);

      const entries = (historyService.recordMany as jest.Mock).mock.calls[0]?.[0] as Array<{ fieldName: string }> ?? [];
      expect(entries.every((e) => e.fieldName !== 'walletAddress')).toBe(true);
    });

    it('is a no-op when entity is undefined', async () => {
      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);

      await subscriber.afterInsert({ entity: undefined } as never);

      expect(historyService.recordMany).not.toHaveBeenCalled();
    });
  });

  describe('afterUpdate', () => {
    it('records only the changed fields', async () => {
      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);

      const previous = makeUser({ username: 'old_name', displayName: 'Old' });
      const updated = makeUser({ username: 'new_name', displayName: 'Old' });
      const event = makeUpdateEvent(updated, previous, ['username', 'displayName', 'walletAddress']);

      await subscriber.afterUpdate(event as never);

      expect(historyService.recordMany).toHaveBeenCalledTimes(1);
      const entries = (historyService.recordMany as jest.Mock).mock.calls[0][0] as Array<{
        fieldName: string;
        oldValue: unknown;
        newValue: unknown;
      }>;

      expect(entries).toHaveLength(1);
      expect(entries[0].fieldName).toBe('username');
      expect(entries[0].oldValue).toBe('old_name');
      expect(entries[0].newValue).toBe('new_name');
    });

    it('records nothing when no tracked fields changed', async () => {
      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);

      const user = makeUser({ username: 'same' });
      const event = makeUpdateEvent(user, { ...user } as User, ['username', 'displayName']);

      await subscriber.afterUpdate(event as never);

      expect(historyService.recordMany).not.toHaveBeenCalled();
    });

    it('skips ignored fields (usernameChangedAt, createdAt)', async () => {
      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);

      const previous = makeUser({ usernameChangedAt: new Date('2024-01-01') });
      const updated = makeUser({ usernameChangedAt: new Date('2024-06-01') });
      const event = makeUpdateEvent(updated, previous, ['usernameChangedAt', 'createdAt']);

      await subscriber.afterUpdate(event as never);

      expect(historyService.recordMany).not.toHaveBeenCalled();
    });

    it('records a null-to-value change (displayName set for the first time)', async () => {
      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);

      const previous = makeUser({ displayName: null });
      const updated = makeUser({ displayName: 'Alice' });
      const event = makeUpdateEvent(updated, previous, ['displayName']);

      await subscriber.afterUpdate(event as never);

      const entries = (historyService.recordMany as jest.Mock).mock.calls[0][0] as Array<{
        fieldName: string; oldValue: unknown; newValue: unknown;
      }>;
      expect(entries[0].oldValue).toBeNull();
      expect(entries[0].newValue).toBe('Alice');
    });

    it('records a value-to-null change (displayName cleared)', async () => {
      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);

      const previous = makeUser({ displayName: 'Alice' });
      const updated = makeUser({ displayName: null });
      const event = makeUpdateEvent(updated, previous, ['displayName']);

      await subscriber.afterUpdate(event as never);

      const entries = (historyService.recordMany as jest.Mock).mock.calls[0][0] as Array<{
        fieldName: string; oldValue: unknown; newValue: unknown;
      }>;
      expect(entries[0].oldValue).toBe('Alice');
      expect(entries[0].newValue).toBeNull();
    });

    it('warns and skips when databaseEntity is missing', async () => {
      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);
      const warnSpy = jest.spyOn((subscriber as any).logger, 'warn').mockImplementation();

      await subscriber.afterUpdate({ entity: makeUser(), databaseEntity: undefined, metadata: { columns: [] } } as never);

      expect(historyService.recordMany).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('attributes the change to the active request context', async () => {
      jest.spyOn(contextModule, 'getProfileHistoryContext').mockReturnValue({
        changedBy: 'ADMIN_WALLET_ADDRESS_HERE_PLACEHOLDER0000',
        reason: ChangeReason.ADMIN_EDIT,
      });

      const historyService = makeHistoryService();
      const subscriber = new UserEntitySubscriber(makeDataSource() as never, historyService as never);

      const previous = makeUser({ username: 'old' });
      const updated = makeUser({ username: 'new' });
      const event = makeUpdateEvent(updated, previous, ['username']);

      await subscriber.afterUpdate(event as never);

      const entries = (historyService.recordMany as jest.Mock).mock.calls[0][0] as Array<{
        changedBy: string; changeReason: ChangeReason;
      }>;
      expect(entries[0].changedBy).toBe('ADMIN_WALLET_ADDRESS_HERE_PLACEHOLDER0000');
      expect(entries[0].changeReason).toBe(ChangeReason.ADMIN_EDIT);
    });
  });
});
