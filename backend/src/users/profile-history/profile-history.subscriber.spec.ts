import { ChangeReason, ProfileType } from './entities/profile-history.entity';
import { runAsActor } from './profile-history.context';
import { ProfileHistorySubscriber } from './profile-history.subscriber';

describe('ProfileHistorySubscriber', () => {
  let subscriber: ProfileHistorySubscriber;
  const manager = {
    create: jest.fn((_cls: unknown, plain: Record<string, unknown>) => plain),
    save: jest.fn(),
  };

  const makeEvent = (
    name: string,
    entity: Record<string, unknown>,
    databaseEntity: Record<string, unknown>,
    columns: string[],
  ) =>
    ({
      metadata: { name },
      entity,
      databaseEntity,
      updatedColumns: columns.map((propertyName) => ({ propertyName })),
      manager,
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    manager.save.mockResolvedValue(undefined);
    subscriber = new ProfileHistorySubscriber();
  });

  it('captures a mentor profile field change with a system actor', async () => {
    await subscriber.afterUpdate(
      makeEvent('MentorProfile', { userId: 'm-1', bio: 'new' }, { userId: 'm-1', bio: 'old' }, ['bio']),
    );

    const rows = manager.save.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: 'm-1',
      profileType: ProfileType.MENTOR,
      fieldName: 'bio',
      oldValue: 'old',
      newValue: 'new',
      changedBy: 'system',
      changeReason: ChangeReason.SYSTEM,
    });
  });

  it('stores old/new values as structured data', async () => {
    await subscriber.afterUpdate(
      makeEvent(
        'MentorProfile',
        { userId: 'm-1', skills: ['ts', 'node'] },
        { userId: 'm-1', skills: ['ts'] },
        ['skills'],
      ),
    );
    const row = (manager.save.mock.calls[0][0] as Array<Record<string, unknown>>)[0];
    expect(row.oldValue).toEqual(['ts']);
    expect(row.newValue).toEqual(['ts', 'node']);
  });

  it('redacts sensitive user fields', async () => {
    await subscriber.afterUpdate(
      makeEvent('User', { id: 'u-1', walletAddress: 'GNEW' }, { id: 'u-1', walletAddress: 'GOLD' }, ['walletAddress']),
    );
    const row = (manager.save.mock.calls[0][0] as Array<Record<string, unknown>>)[0];
    expect(row.oldValue).toBe('[REDACTED]');
    expect(row.newValue).toBe('[REDACTED]');
    expect(row.userId).toBe('u-1');
    expect(row.profileType).toBe(ProfileType.MENTEE);
  });

  it('records the acting user when run inside an actor context', async () => {
    await runAsActor({ changedBy: 'admin-9', changeReason: ChangeReason.ADMIN_EDIT }, () =>
      subscriber.afterUpdate(makeEvent('User', { id: 'u-1', displayName: 'B' }, { id: 'u-1', displayName: 'A' }, ['displayName'])),
    );
    const row = (manager.save.mock.calls[0][0] as Array<Record<string, unknown>>)[0];
    expect(row.changedBy).toBe('admin-9');
    expect(row.changeReason).toBe(ChangeReason.ADMIN_EDIT);
  });

  it('ignores fields that are not tracked (e.g. lastLoginAt)', async () => {
    await subscriber.afterUpdate(
      makeEvent('User', { id: 'u-1', lastLoginAt: new Date() }, { id: 'u-1', lastLoginAt: null }, ['lastLoginAt']),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('ignores fields whose value did not actually change', async () => {
    await subscriber.afterUpdate(
      makeEvent('MentorProfile', { userId: 'm-1', bio: 'same' }, { userId: 'm-1', bio: 'same' }, ['bio']),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('ignores entities without a tracking configuration', async () => {
    await subscriber.afterUpdate(makeEvent('RefreshToken', { id: 't-1' }, { id: 't-1' }, ['revokedAt']));
    expect(manager.save).not.toHaveBeenCalled();
  });
});
